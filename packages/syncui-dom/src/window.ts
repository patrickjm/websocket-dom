import type { Router } from "express";
import { Router as ExpressRouter } from "express";
import { SyncUISession } from "syncui";
import type { UiAdapterFactory } from "syncui/core/adapter/types";
import type { TransportConnection } from "syncui/core/transport/types";
import type { JsdomAdapterDeps, JsdomAdapterOptions } from "./adapter/dom";
import { createJsdomAdapter } from "./adapter/dom";
import type { PlaywrightAdapterDeps } from "./adapter/playwright";
import { createPlaywrightAdapter } from "./adapter/playwright";

const DEFAULT_HTML = "<!doctype html><html><head></head><body></body></html>";

type DomWindowAdapter =
  | {
      type: "jsdom";
      deps: JsdomAdapterDeps;
      options?: JsdomAdapterOptions;
    }
  | {
      type: "playwright";
      deps: PlaywrightAdapterDeps;
    };

export type SyncUIDomWindowOptions = {
  url: string;
  html?: string;
  sessionId?: string;
  assetProxy?: AssetProxyConfig;
  adapter: DomWindowAdapter;
};

export type AssetProxyConfig = {
  baseUrl: string;
  secret?: string;
  ttlMs?: number;
  allowUrl?: (url: URL) => boolean;
};

export class SyncUIDomWindow {
  private readonly session: SyncUISession;
  private currentUrl: string;

  constructor(options: SyncUIDomWindowOptions) {
    const htmlDocument = options.html ?? DEFAULT_HTML;
    let adapterFactory: UiAdapterFactory;
    if (options.adapter.type === "jsdom") {
      const adapter = options.adapter;
      adapterFactory = (doc: string, adapterOptions: { url: string }) =>
        createJsdomAdapter(doc, adapterOptions, adapter.deps, adapter.options);
    } else {
      const adapter = options.adapter;
      adapterFactory = (doc: string, adapterOptions: { url: string }) =>
        createPlaywrightAdapter({
          ...adapter.deps,
          htmlDocument: doc,
          url: adapterOptions.url,
        });
    }

    this.currentUrl = options.url;
    this.session = new SyncUISession({
      htmlDocument,
      url: options.url,
      adapter: adapterFactory,
      sessionId: options.sessionId,
      assetProxy: options.assetProxy,
    });
  }

  get sessionId() {
    return this.session.sessionId;
  }

  addConnection(transport: TransportConnection) {
    this.session.addConnection(transport);
  }

  removeConnection(transport: TransportConnection) {
    this.session.removeConnection(transport);
  }

  domImport(url: string) {
    this.session.domImport(url);
  }

  evalString(code: string) {
    return this.session.evalString(code);
  }

  navigate(url: string) {
    const resolved = new URL(url, this.currentUrl).toString();
    this.currentUrl = resolved;
    return this.session.navigate(resolved);
  }

  enableAssetProxy(config: Omit<AssetProxyConfig, "sessionId">) {
    return this.session.enableAssetProxy(config);
  }

  getAssetProxy() {
    return this.session.getAssetProxy();
  }

  getAssetProxyUrl(url: string, opts?: { expiresAtMs?: number }) {
    return this.session.getAssetProxyUrl(url, opts);
  }

  setAssetProxyBaseUrl(baseUrl: string) {
    this.session.setAssetProxyBaseUrl(baseUrl);
  }

  assetProxyHandler() {
    return this.session.assetProxyHandler();
  }

  assetProxyRouter(): Router {
    return this.assetProxyRouterAt("/syncui");
  }

  assetProxyRouterAt(pathPrefix: string): Router {
    const router = ExpressRouter();
    const normalized = normalizePathPrefix(pathPrefix);
    router.get(`${normalized}/:session/assets/*`, async (req, res) => {
      if (req.params.session !== this.sessionId) {
        res.status(404).end("not found");
        return;
      }
      const proxy = this.getAssetProxy();
      if (!proxy) {
        res.status(404).end("not found");
        return;
      }
      await proxy.handlerWithBase(req, res, normalized);
    });
    return router;
  }

  terminate() {
    this.session.terminate();
  }
}

const normalizePathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "/syncui";
  }
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
};

export const createDomWindow = (options: SyncUIDomWindowOptions) =>
  new SyncUIDomWindow(options);
