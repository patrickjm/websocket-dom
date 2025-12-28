import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { WebsocketDOM } from "../../src";
import { createWebSocketServerTransport } from "../../src/transport/ws-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TestServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number;
  private sessions = new Map<string, WebsocketDOM>();
  private baseDoc: string;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.port = 3333;
    this.baseDoc =
      '<!DOCTYPE html><html lang="en" data-app="wsdom"><head><meta charset="utf-8"><title>Initial Title</title><script id="init-script">window.__initScript = true;</script></head><body data-state="initial"></body></html>';

    this.wss.on("connection", (ws, request) => {
      const url = new URL(request.url ?? "/", `http://localhost:${this.port}`);
      const sessionId = url.searchParams.get("session") ?? "default";
      const wsDom = this.getSession(sessionId);
      wsDom.addConnection(createWebSocketServerTransport(ws));

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "e2e-import") {
          wsDom.domImport(message.path);
        }
      });
    });

    this.app.use(express.static(path.join(__dirname, "../dist")));
  }

  private getSession(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const session = new WebsocketDOM({
      htmlDocument: this.baseDoc,
      url: `http://localhost:${this.port}`,
    });
    this.sessions.set(sessionId, session);
    return session;
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
        } else {
          for (const session of this.sessions.values()) {
            session.terminate();
          }
          this.sessions.clear();
          resolve();
        }
      });
    });
  }
}
