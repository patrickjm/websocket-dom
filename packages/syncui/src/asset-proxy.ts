import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { parseFragment, serialize } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

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
  rewriteHtml: (html: string) => string;
  rewriteCss: (css: string, baseUrl?: string) => string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
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

const isSafeUrl = (raw: string) => {
  const trimmed = raw.trim().toLowerCase();
  return !(
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("#")
  );
};

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

const parseProxyPath = (url: URL): ParsedProxyPath | null => {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 5) {
    return null;
  }
  if (segments[0] !== "syncui" || segments[2] !== "assets") {
    return null;
  }
  const sessionId = segments[1];
  const exp = Number(segments[3]);
  const token = segments[4];
  const encodedUrl = segments.slice(5).join("/");
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

const rewriteSrcSet = (
  value: string,
  baseUrl: string,
  rewrite: (url: string) => string | null
) => {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .map((part) => {
      const [rawUrl, ...rest] = part.split(/\s+/);
      if (!rawUrl) {
        return part;
      }
      const resolved = rewrite(resolveUrl(rawUrl, baseUrl));
      if (!resolved) {
        return part;
      }
      return [resolved, ...rest].join(" ");
    })
    .join(", ");
};

const resolveUrl = (raw: string, baseUrl: string) => {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
};

const rewriteCssUrls = (
  css: string,
  baseUrl: string,
  rewrite: (url: string) => string | null
) => {
  const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const importPattern = /@import\s+(?:url\()?\s*['"]?([^'")\s]+)['"]?\s*\)?/gi;
  const replaceUrl = (value: string) => {
    if (!isSafeUrl(value)) {
      return value;
    }
    const resolved = rewrite(resolveUrl(value, baseUrl));
    return resolved ?? value;
  };
  const withImports = css.replace(importPattern, (match, url) => {
    const rewritten = replaceUrl(url);
    if (rewritten === url) {
      return match;
    }
    return match.replace(url, rewritten);
  });
  return withImports.replace(urlPattern, (match, _quote, url) => {
    const rewritten = replaceUrl(url);
    if (rewritten === url) {
      return match;
    }
    return `url("${rewritten}")`;
  });
};

const rewriteHtmlUrls = (
  html: string,
  baseUrl: string,
  rewrite: (url: string) => string | null
) => {
  const fragment = parseFragment(html);
  walkHtmlNodes(fragment, (node) => {
    if (!isElementNode(node)) {
      return;
    }
    rewriteElementAttributes(node, baseUrl, rewrite);
    rewriteStyleTag(node, baseUrl, rewrite);
  });
  return serialize(fragment);
};

const walkHtmlNodes = (
  root: DefaultTreeAdapterMap["node"],
  visit: (node: DefaultTreeAdapterMap["node"]) => void
) => {
  const stack: DefaultTreeAdapterMap["node"][] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!(node && "childNodes" in node)) {
      continue;
    }
    for (const child of node.childNodes ?? []) {
      stack.push(child);
      visit(child);
    }
  }
};

const isElementNode = (
  node: DefaultTreeAdapterMap["node"]
): node is DefaultTreeAdapterMap["element"] =>
  "tagName" in node && "attrs" in node;

const rewriteElementAttributes = (
  node: DefaultTreeAdapterMap["element"],
  baseUrl: string,
  rewrite: (url: string) => string | null
) => {
  if (!node.attrs) {
    return;
  }
  const attrs = node.attrs as { name: string; value: string }[];
  const tag = node.tagName.toLowerCase();
  for (const attr of attrs) {
    const updated = rewriteAttributeValue(tag, attr, baseUrl, rewrite);
    if (updated !== null) {
      attr.value = updated;
    }
  }
};

const rewriteAttributeValue = (
  tag: string,
  attr: { name: string; value: string },
  baseUrl: string,
  rewrite: (url: string) => string | null
): string | null => {
  const name = attr.name.toLowerCase();
  if (name === "style") {
    return rewriteCssUrls(attr.value, baseUrl, rewrite);
  }
  if (name === "srcset") {
    return rewriteSrcSet(attr.value, baseUrl, rewrite);
  }
  if (!(shouldRewriteUrl(tag, name) && isSafeUrl(attr.value))) {
    return null;
  }
  const resolved = rewrite(resolveUrl(attr.value, baseUrl));
  return resolved ?? null;
};

const shouldRewriteUrl = (tag: string, attrName: string): boolean => {
  if (attrName === "xlink:href") {
    return true;
  }
  if (attrName === "href") {
    return tag === "link";
  }
  return ["src", "poster", "data"].includes(attrName);
};

const rewriteStyleTag = (
  node: DefaultTreeAdapterMap["element"],
  baseUrl: string,
  rewrite: (url: string) => string | null
) => {
  if (node.tagName.toLowerCase() !== "style" || !("childNodes" in node)) {
    return;
  }
  for (const child of node.childNodes ?? []) {
    if (!(isTextNode(child) && child.value)) {
      continue;
    }
    child.value = rewriteCssUrls(child.value, baseUrl, rewrite);
  }
};

const isTextNode = (
  node: DefaultTreeAdapterMap["node"]
): node is DefaultTreeAdapterMap["textNode"] =>
  "nodeName" in node && node.nodeName === "#text";

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
  allowUrl: AllowUrl
): { target: URL } | { error: ProxyError } => {
  const url = new URL(req.url ?? "", "http://localhost");
  const parsed = parseProxyPath(url);
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

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const parsed = parseProxyRequest(
      req,
      config.sessionId,
      sessionSecret,
      allowUrl
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
      await sendCssResponse(res, response, target.toString(), rewriteCss);
      return;
    }

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  };

  const rewriteHtml = (html: string) =>
    rewriteHtmlUrls(html, baseUrl, (url) => getProxyUrl(url));

  const rewriteCss = (css: string, overrideBaseUrl?: string) =>
    rewriteCssUrls(css, overrideBaseUrl ?? baseUrl, (url) => getProxyUrl(url));

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
  };
};
