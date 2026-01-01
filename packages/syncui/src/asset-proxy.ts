import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createAssetRewriter,
  isSafeUrl,
  resolveUrl,
  type AssetRewrite,
} from "./asset-rewrite";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

type AllowUrl = (url: URL) => boolean;

export type AssetProxyConfig = {
  sessionId: string;
  baseUrl: string;
  secret?: string;
  ttlMs?: number;
  allowUrl?: AllowUrl;
};

export type AssetProxy = {
  sessionId: string;
  readonly baseUrl: string;
  setBaseUrl: (baseUrl: string) => void;
  getProxyUrl: (url: string, opts?: { expiresAtMs?: number }) => string | null;
  rewriteHtml: AssetRewrite["rewriteHtml"];
  rewriteCss: AssetRewrite["rewriteCss"];
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  handlerWithBase: (
    req: IncomingMessage,
    res: ServerResponse,
    basePath: string
  ) => Promise<void>;
};

type ParsedProxyPath = {
  sessionId: string;
  exp: number;
  token: string;
  url: string;
};

const toBase64Url = (buffer: Buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) =>
  value.replace(/-/g, "+").replace(/_/g, "/");

const getSessionSecret = (masterSecret: string, sessionId: string) => {
  const hmac = crypto.createHmac("sha256", masterSecret);
  hmac.update(sessionId);
  return hmac.digest();
};

const signToken = (
  secret: Buffer,
  sessionId: string,
  url: string,
  exp: number
) => {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${sessionId}|${url}|${exp}`);
  return toBase64Url(hmac.digest());
};

const timingSafeEquals = (a: string, b: string) => {
  const bufferA = Buffer.from(fromBase64Url(a), "base64");
  const bufferB = Buffer.from(fromBase64Url(b), "base64");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
};

const parseProxyPathFromBase = (
  url: URL,
  basePath: string
): ParsedProxyPath | null => {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 5) {
    return null;
  }
  const expected = basePath.split("/").filter(Boolean);
  const prefix = segments.slice(0, expected.length);
  if (
    prefix.join("/") !== expected.join("/") ||
    segments[expected.length + 1] !== "assets"
  ) {
    return null;
  }
  const sessionId = segments[expected.length];
  const exp = Number(segments[expected.length + 2]);
  const token = segments[expected.length + 3];
  const encodedUrl = segments.slice(expected.length + 4).join("/");
  if (!(sessionId && token) || Number.isNaN(exp)) {
    return null;
  }
  return {
    sessionId,
    exp,
    token,
    url: decodeURIComponent(encodedUrl),
  };
};

type ProxyError = { status: number; body: string };

const respondWithError = (res: ServerResponse, error: ProxyError) => {
  res.statusCode = error.status;
  res.end(error.body);
};

const validateExpiry = (exp: number): ProxyError | null => {
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { status: 401, body: "expired" };
  }
  return null;
};

const validateToken = (
  sessionSecret: Buffer,
  sessionId: string,
  url: string,
  exp: number,
  token: string
): ProxyError | null => {
  const expected = signToken(sessionSecret, sessionId, url, exp);
  if (!timingSafeEquals(token, expected)) {
    return { status: 401, body: "invalid token" };
  }
  return null;
};

const parseTargetUrl = (
  url: string,
  allowUrl: AllowUrl
): { target: URL } | { error: ProxyError } => {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { error: { status: 400, body: "invalid url" } };
  }
  if (!allowUrl(target)) {
    return { error: { status: 403, body: "blocked" } };
  }
  return { target };
};

const parseProxyRequest = (
  req: IncomingMessage,
  sessionId: string,
  sessionSecret: Buffer,
  allowUrl: AllowUrl,
  basePath: string
): { target: URL } | { error: ProxyError } => {
  const url = new URL(req.url ?? "", "http://localhost");
  const parsed = parseProxyPathFromBase(url, basePath);
  if (!parsed || parsed.sessionId !== sessionId) {
    return { error: { status: 404, body: "not found" } };
  }
  const expiryError = validateExpiry(parsed.exp);
  if (expiryError) {
    return { error: expiryError };
  }
  const tokenError = validateToken(
    sessionSecret,
    parsed.sessionId,
    parsed.url,
    parsed.exp,
    parsed.token
  );
  if (tokenError) {
    return { error: tokenError };
  }
  return parseTargetUrl(parsed.url, allowUrl);
};

const isCssResponse = (contentType: string) => contentType.includes("text/css");

const sendCssResponse = async (
  res: ServerResponse,
  response: Response,
  baseUrl: string,
  rewriteCss: (css: string, overrideBaseUrl?: string) => string
) => {
  const text = await response.text();
  const rewritten = rewriteCss(text, baseUrl);
  const body = Buffer.from(rewritten);
  res.setHeader("content-type", "text/css; charset=utf-8");
  res.setHeader("content-length", body.length);
  res.end(body);
};

export const createAssetProxy = (config: AssetProxyConfig): AssetProxy => {
  const secret = config.secret ?? toBase64Url(crypto.randomBytes(32));
  const sessionSecret = getSessionSecret(secret, config.sessionId);
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const allowUrl: AllowUrl =
    config.allowUrl ??
    ((url) => url.protocol === "http:" || url.protocol === "https:");

  let baseUrl = config.baseUrl;

  const setBaseUrl = (nextBaseUrl: string) => {
    baseUrl = nextBaseUrl;
  };

  const getProxyUrl = (url: string, opts?: { expiresAtMs?: number }) => {
    if (!isSafeUrl(url)) {
      return null;
    }
    const resolved = resolveUrl(url, baseUrl);
    let parsed: URL;
    try {
      parsed = new URL(resolved);
    } catch {
      return null;
    }
    if (!allowUrl(parsed)) {
      return null;
    }
    const exp = Math.floor((opts?.expiresAtMs ?? Date.now() + ttlMs) / 1000);
    const token = signToken(
      sessionSecret,
      config.sessionId,
      parsed.toString(),
      exp
    );
    const encoded = encodeURIComponent(parsed.toString());
    return `/syncui/${config.sessionId}/assets/${exp}/${token}/${encoded}`;
  };

  const rewriter = createAssetRewriter(
    () => baseUrl,
    (url) => getProxyUrl(url)
  );

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    return handlerWithBase(req, res, "/syncui");
  };

  const handlerWithBase = async (
    req: IncomingMessage,
    res: ServerResponse,
    basePath: string
  ) => {
    const parsed = parseProxyRequest(
      req,
      config.sessionId,
      sessionSecret,
      allowUrl,
      basePath
    );
    if ("error" in parsed) {
      respondWithError(res, parsed.error);
      return;
    }
    const { target } = parsed;
    const response = await fetch(target);
    const contentType = response.headers.get("content-type") ?? "";
    res.statusCode = response.status;

    if (isCssResponse(contentType)) {
      await sendCssResponse(
        res,
        response,
        target.toString(),
        rewriter.rewriteCss
      );
      return;
    }

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  };

  const rewriteHtml = rewriter.rewriteHtml;
  const rewriteCss = rewriter.rewriteCss;

  return {
    sessionId: config.sessionId,
    get baseUrl() {
      return baseUrl;
    },
    setBaseUrl,
    getProxyUrl,
    rewriteHtml,
    rewriteCss,
    handler,
    handlerWithBase,
  };
};
