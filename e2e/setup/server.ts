import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { WebsocketDOM } from '../../src';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TestServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.port = 3333; // Using different port than main app for tests

    // Handle websocket connections
    this.wss.on('connection', (ws) => {
      const doc = '<!DOCTYPE html><html><body></body></html>';
      const wsDom = new WebsocketDOM({
        websocket: ws,
        htmlDocument: doc,
        url: `http://localhost:${this.port}`
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'e2e-import') {
          wsDom.import(message.path);
        }
      });

      ws.on('close', () => {
        wsDom.terminate();
      });
    });

    // Serve client-side code
    this.app.use(express.static(path.join(__dirname, '../dist')));
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.server.listen(this.port, () => {
        // Wait a short moment to ensure WebSocket server is ready
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
        if (err) reject(err);
        else resolve();
      });
    });
  }
} 