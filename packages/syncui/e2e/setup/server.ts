import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { SyncUIDomWindow } from "syncui-dom/server";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { JSDOM } from "jsdom";
import { chromium, type Browser, type Page } from "@playwright/test";
import { ASSET_PROXY_SECRET } from "./asset-proxy";
import {
  NAV_ORIGIN_A,
  NAV_ORIGIN_B,
  NAV_PORT_A,
  NAV_PORT_B,
} from "./navigation-origins";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TestServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number;
  private sessions = new Map<string, SyncUIDomWindow>();
  private sessionPromises = new Map<string, Promise<SyncUIDomWindow>>();
  private playwrightPages = new Map<string, Page>();
  private playwrightBrowser: Browser | null = null;
  private baseDoc: string;
  private adapter: "jsdom" | "playwright";
  private navServerA: http.Server;
  private navServerB: http.Server;
  private navPortA: number;
  private navPortB: number;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.port = Number(process.env.SYNCUI_PORT ?? 3333);
    this.navPortA = NAV_PORT_A;
    this.navPortB = NAV_PORT_B;
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

    const navAppA = express();
    const navAppB = express();
    navAppA.use((_req, res, next) => {
      res.setHeader("access-control-allow-origin", "*");
      next();
    });
    navAppB.use((_req, res, next) => {
      res.setHeader("access-control-allow-origin", "*");
      next();
    });

    navAppA.get("/", (_req, res) => {
      res.type("text/html");
      res.send(
        `<html><head><title>Origin A</title></head><body><div id="nav-page" data-page="a">A</div><a id="nav-link" href="${NAV_ORIGIN_B}/">to B</a></body></html>`
      );
    });

    navAppB.get("/", (_req, res) => {
      res.type("text/html");
      res.send(
        `<html><head><title>Origin B</title></head><body><div id="nav-page" data-page="b">B</div><a id="nav-link" href="${NAV_ORIGIN_A}/">to A</a></body></html>`
      );
    });

    this.navServerA = http.createServer(navAppA);
    this.navServerB = http.createServer(navAppB);
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
      if (message.type === "e2e-eval" && message.code) {
        void this.getSession(sessionId)
          .then((session) => session.evalString(message.code))
          .catch((error) => {
            console.error(
              `Failed to eval test script for session ${sessionId}:`,
              error
            );
          });
      }
      if (message.type === "e2e-navigate" && message.url) {
        void this.getSession(sessionId)
          .then((session) => session.navigate(message.url))
          .catch((error) => {
            console.error(`Failed to navigate session ${sessionId}:`, error);
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
        const session =
          this.adapter === "playwright"
            ? await this.createPlaywrightWindow(sessionId, url)
            : new SyncUIDomWindow({
                url,
                html: this.baseDoc,
                sessionId,
                adapter: {
                  type: "jsdom",
                  deps: { JSDOM },
                },
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

  private async createPlaywrightWindow(
    sessionId: string,
    url: string
  ): Promise<SyncUIDomWindow> {
    if (!this.playwrightBrowser) {
      this.playwrightBrowser = await chromium.launch();
    }
    const page = await this.playwrightBrowser.newPage();
    this.playwrightPages.set(sessionId, page);
    return new SyncUIDomWindow({
      url,
      html: this.baseDoc,
      sessionId,
      adapter: {
        type: "playwright",
        deps: { page, url, htmlDocument: this.baseDoc },
      },
    });
  }

  async start() {
    await Promise.all([
      this.listenServer(this.navServerA, this.navPortA),
      this.listenServer(this.navServerB, this.navPortB),
    ]);

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
          await Promise.all([
            this.closeServer(this.navServerA),
            this.closeServer(this.navServerB),
          ]);
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

  private listenServer(server: http.Server, port: number) {
    return new Promise<void>((resolve) => {
      server.listen(port, resolve);
    });
  }

  private closeServer(server: http.Server) {
    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
