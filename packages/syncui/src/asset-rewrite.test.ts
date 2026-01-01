import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAssetRewriter } from "./asset-rewrite";

const createRewriter = (baseUrl: string) =>
  createAssetRewriter(
    () => baseUrl,
    (url) => `proxy:${url}`
  );

describe("asset rewrite", () => {
  it("rewrites CSS url() and @import values", () => {
    const rewriter = createRewriter("https://example.com/base/");
    const css = "body{background:url('img.png');}@import url('/a.css');";
    const rewritten = rewriter.rewriteCss(css);
    assert.match(
      rewritten,
      /url\(['"]proxy:https:\/\/example\.com\/base\/img\.png['"]\)/
    );
    assert.match(
      rewritten,
      /@import url\(['"]proxy:https:\/\/example\.com\/a\.css['"]\)/
    );
  });

  it("rewrites HTML attributes and inline styles", () => {
    const rewriter = createRewriter("https://example.com/");
    const html =
      '<link href="/a.css"><img src="img.png" srcset="a.png 1x, /b.png 2x"><div style="background:url(/c.png)"></div>';
    const rewritten = rewriter.rewriteHtml(html);
    assert.match(rewritten, /href="proxy:https:\/\/example\.com\/a\.css"/);
    assert.match(rewritten, /src="proxy:https:\/\/example\.com\/img\.png"/);
    assert.match(
      rewritten,
      /srcset="proxy:https:\/\/example\.com\/a\.png 1x, proxy:https:\/\/example\.com\/b\.png 2x"/
    );
    assert.match(
      rewritten,
      /style="background:url\(&quot;proxy:https:\/\/example\.com\/c\.png&quot;\)"/
    );
  });

  it("does not rewrite unsafe URLs", () => {
    const rewriter = createRewriter("https://example.com/");
    const html = '<a href="javascript:alert(1)">bad</a>';
    const rewritten = rewriter.rewriteHtml(html);
    assert.match(rewritten, /href="javascript:alert\(1\)"/);
  });
});
