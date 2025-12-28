import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { WebsocketDOM } from "../../src";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { createDom } from "syncui-dom/adapter-server-jsdom";
import { createPlaywrightAdapter } from "syncui-dom/adapter-server-playwright";
import { JSDOM } from "jsdom";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { UiAdapterFactory } from "../../src/core/adapter/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TestServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number;
  private sessions = new Map<string, WebsocketDOM>();
  private sessionPromises = new Map<string, Promise<WebsocketDOM>>();
  private playwrightPages = new Map<string, Page>();
  private playwrightBrowser: Browser | null = null;
  private baseDoc: string;
  private adapter: "jsdom" | "playwright";

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.port = 3333;
    this.adapter =
      process.env.SYNCUI_ADAPTER === "playwright" ? "playwright" : "jsdom";
    this.baseDoc =
      '<!DOCTYPE html><html lang="en" data-app="wsdom"><head><meta charset="utf-8"><title>Initial Title</title><script id="init-script">window.__initScript = true;</script></head><body data-state="initial"></body></html>';

    this.wss.on("connection", (ws, request) => {
      void this.handleConnection(ws, request);
    });

    this.app.use(express.static(path.join(__dirname, "../dist")));
  }

  private async handleConnection(
    ws: import("ws").WebSocket,
    request: http.IncomingMessage
  ) {
    const url = new URL(request.url ?? "/", `http://localhost:${this.port}`);
    const sessionId = url.searchParams.get("session") ?? "default";
    const wsDom = await this.getSession(sessionId);
    wsDom.addConnection(createWebSocketServerTransport(ws));

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "e2e-import") {
        wsDom.domImport(message.path);
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
                createDom(document, options, { JSDOM });
        const session = new WebsocketDOM({
          htmlDocument: this.baseDoc,
          url,
          adapter,
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
