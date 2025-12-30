import { expect, test } from "@playwright/test";
import { createAssetProxy } from "../../src/asset-proxy";
import { ASSET_PROXY_BASE_URL, ASSET_PROXY_SECRET } from "../setup/asset-proxy";
import { gotoTestSession } from "../setup/session";

test("asset proxy serves and rewrites css", async ({ page }) => {
  const sessionId = await gotoTestSession(page);
  const proxy = createAssetProxy({
    sessionId,
    baseUrl: ASSET_PROXY_BASE_URL,
    secret: ASSET_PROXY_SECRET,
    allowUrl: (url) => url.origin === ASSET_PROXY_BASE_URL,
  });
  const proxyUrl = proxy.getProxyUrl(
    `${ASSET_PROXY_BASE_URL}/test-assets/style.css`
  );
  expect(proxyUrl).not.toBeNull();
  const response = await page.request.get(`${ASSET_PROXY_BASE_URL}${proxyUrl}`);
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain(`/syncui/${sessionId}/assets/`);
  expect(text).toContain("bg.png");
});

test("asset proxy rejects invalid tokens", async ({ page }) => {
  const sessionId = await gotoTestSession(page);
  const proxy = createAssetProxy({
    sessionId,
    baseUrl: ASSET_PROXY_BASE_URL,
    secret: ASSET_PROXY_SECRET,
    allowUrl: (url) => url.origin === ASSET_PROXY_BASE_URL,
  });
  const proxyUrl = proxy.getProxyUrl(
    `${ASSET_PROXY_BASE_URL}/test-assets/style.css`
  );
  expect(proxyUrl).not.toBeNull();
  if (!proxyUrl) {
    throw new Error("Proxy url was not generated.");
  }
  const tampered = proxyUrl.replace(
    /\/assets\/(\d+)\/([^/]+)/,
    "/assets/$1/badtoken"
  );
  const response = await page.request.get(`${ASSET_PROXY_BASE_URL}${tampered}`);
  expect(response.status()).toBe(401);
});

test("asset proxy rejects expired tokens", async ({ page }) => {
  const sessionId = await gotoTestSession(page);
  const proxy = createAssetProxy({
    sessionId,
    baseUrl: ASSET_PROXY_BASE_URL,
    secret: ASSET_PROXY_SECRET,
    allowUrl: (url) => url.origin === ASSET_PROXY_BASE_URL,
  });
  const proxyUrl = proxy.getProxyUrl(
    `${ASSET_PROXY_BASE_URL}/test-assets/style.css`,
    { expiresAtMs: Date.now() - 1000 }
  );
  expect(proxyUrl).not.toBeNull();
  const response = await page.request.get(`${ASSET_PROXY_BASE_URL}${proxyUrl}`);
  expect(response.status()).toBe(401);
});
