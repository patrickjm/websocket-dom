import { parseFragment, serialize } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

export type UrlRewriteFn = (url: string) => string | null;

export type AssetRewrite = {
  rewriteHtml: (html: string) => string;
  rewriteCss: (css: string, overrideBaseUrl?: string) => string;
};

export const createAssetRewriter = (
  getBaseUrl: () => string,
  rewriteUrl: UrlRewriteFn
): AssetRewrite => ({
  rewriteHtml: (html: string) =>
    rewriteHtmlUrls(html, getBaseUrl(), rewriteUrl),
  rewriteCss: (css: string, overrideBaseUrl?: string) =>
    rewriteCssUrls(css, overrideBaseUrl ?? getBaseUrl(), rewriteUrl),
});

export const isSafeUrl = (raw: string) => {
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

export const resolveUrl = (raw: string, baseUrl: string) => {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
};

const rewriteCssUrls = (
  css: string,
  baseUrl: string,
  rewrite: UrlRewriteFn
) => {
  const pattern =
    /@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?|url\(\s*(['"]?)([^'")]+)\3\s*\)/gi;
  const replaceUrl = (value: string) => {
    if (!isSafeUrl(value)) {
      return value;
    }
    const resolved = rewrite(resolveUrl(value, baseUrl));
    return resolved ?? value;
  };
  const formatUrl = (value: string, quote?: string) => {
    const resolvedQuote = quote && quote.length > 0 ? quote : '"';
    return `url(${resolvedQuote}${value}${resolvedQuote})`;
  };
  const rewriteValue = (raw: string) => {
    const rewritten = replaceUrl(raw);
    return rewritten === raw ? null : rewritten;
  };
  const rewriteImport = (match: string, importUrl?: string) => {
    if (!importUrl) {
      return null;
    }
    const rewritten = rewriteValue(importUrl);
    return rewritten ? match.replace(importUrl, rewritten) : match;
  };
  const rewriteUrlMatch = (match: string, url?: string, urlQuote?: string) => {
    if (!url) {
      return null;
    }
    const rewritten = rewriteValue(url);
    return rewritten ? formatUrl(rewritten, urlQuote) : match;
  };
  const replaceMatch = (
    match: string,
    importUrl?: string,
    urlQuote?: string,
    url?: string
  ) => {
    return (
      rewriteImport(match, importUrl) ??
      rewriteUrlMatch(match, url, urlQuote) ??
      match
    );
  };
  return css.replace(pattern, (match, _importQuote, importUrl, urlQuote, url) =>
    replaceMatch(match, importUrl, urlQuote, url)
  );
};

const rewriteHtmlUrls = (
  html: string,
  baseUrl: string,
  rewrite: UrlRewriteFn
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
  rewrite: UrlRewriteFn
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
  rewrite: UrlRewriteFn
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

const rewriteSrcSet = (
  value: string,
  baseUrl: string,
  rewrite: UrlRewriteFn
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
  rewrite: UrlRewriteFn
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
