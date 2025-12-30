import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { SyncUIServerSession } from "../../src";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { createJsdomAdapter } from "syncui-dom/adapter-server-jsdom";
import { createPlaywrightAdapter } from "syncui-dom/adapter-server-playwright";
import { JSDOM } from "jsdom";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { UiAdapterFactory } from "../../src/core/adapter/types";
import { ASSET_PROXY_SECRET } from "./asset-proxy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TestServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number;
  private sessions = new Map<string, SyncUIServerSession>();
  private sessionPromises = new Map<string, Promise<SyncUIServerSession>>();
  private playwrightPages = new Map<string, Page>();
  private playwrightBrowser: Browser | null = null;
  private baseDoc: string;
  private adapter: "jsdom" | "playwright";

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.port = Number(process.env.SYNCUI_PORT ?? 3333);
    this.adapter =
      process.env.SYNCUI_ADAPTER === "playwright" ? "playwright" : "jsdom";
    this.baseDoc =
      '<!DOCTYPE html><html lang="en" data-app="wsdom"><head><meta charset="utf-8"><title>Initial Title</title><script id="init-script">window.__initScript = true;</script></head><body data-state="initial"></body></html>';

    this.wss.on("connection", (ws, request) => {
      void this.handleConnection(ws, request);
    });

    this.app.get("/syncui/:session/assets/*", async (req, res) => {
      const sessionId = req.params.session;
      const session = await this.getSession(sessionId);
      const proxy = session.getAssetProxy();
      if (!proxy) {
        res.status(404).end("not found");
        return;
      }
      await proxy.handler(req, res);
    });

    this.app.get("/test-assets/style.css", (_req, res) => {
      res.type("text/css");
      res.send("body{background:url('/test-assets/bg.png');}");
    });

    this.app.get("/test-assets/bg.png", (_req, res) => {
      res.type("image/png");
      res.send(Buffer.from([137, 80, 78, 71]));
    });

    this.app.use(express.static(path.join(__dirname, "../dist")));
  }

  private async handleConnection(
    ws: import("ws").WebSocket,
    request: http.IncomingMessage
  ) {
    const url = new URL(request.url ?? "/", `http://localhost:${this.port}`);
    const sessionId = url.searchParams.get("session") ?? "default";
    try {
      const wsDom = await this.getSession(sessionId);
      wsDom.addConnection(createWebSocketServerTransport(ws));
    } catch (error) {
      console.error(`Failed to initialize session ${sessionId}:`, error);
      ws.close();
      return;
    }

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "e2e-import") {
        void this.getSession(sessionId)
          .then((session) => {
            session.domImport(message.path);
          })
          .catch((error) => {
            console.error(
              `Failed to import test script for session ${sessionId}:`,
              error
            );
          });
      }
    });
  }

  private async getSession(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const pending = this.sessionPromises.get(sessionId);
    if (pending) {
      return pending;
    }
    const created = (async () => {
      try {
        const url = `http://localhost:${this.port}`;
        const adapter =
          this.adapter === "playwright"
            ? await this.createPlaywrightAdapter(sessionId, url)
            : (document: string, options: { url: string }) =>
                createJsdomAdapter(document, options, { JSDOM });
        const session = new SyncUIServerSession({
          htmlDocument: this.baseDoc,
          url,
          adapter,
          sessionId,
        });
        session.enableAssetProxy({
          baseUrl: url,
          secret: ASSET_PROXY_SECRET,
          allowUrl: (target) => target.origin === url,
        });
        this.sessions.set(sessionId, session);
        this.sessionPromises.delete(sessionId);
        return session;
      } catch (error) {
        this.sessionPromises.delete(sessionId);
        throw error;
      }
    })();
    this.sessionPromises.set(sessionId, created);
    return created;
  }

  private async createPlaywrightAdapter(
    sessionId: string,
    url: string
  ): Promise<UiAdapterFactory> {
    if (!this.playwrightBrowser) {
      this.playwrightBrowser = await chromium.launch();
    }
    const page = await this.playwrightBrowser.newPage();
    this.playwrightPages.set(sessionId, page);
    return (document: string, _options: { url: string }) =>
      createPlaywrightAdapter({ page, htmlDocument: document, url });
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.server.listen(this.port, () => {
        setTimeout(() => {
          console.log(`Test server running at http://localhost:${this.port}`);
          resolve();
        }, 100);
      });
    });
  }

  async stop() {
    return new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        (async () => {
          for (const session of this.sessions.values()) {
            session.terminate();
          }
          this.sessions.clear();
          await Promise.all(
            Array.from(this.playwrightPages.values()).map((page) =>
              page.close()
            )
          );
          this.playwrightPages.clear();
          if (this.playwrightBrowser) {
            await this.playwrightBrowser.close();
            this.playwrightBrowser = null;
          }
        })()
          .then(resolve)
          .catch(reject);
      });
    });
  }
}
