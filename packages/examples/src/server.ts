import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { SyncUIServerSession } from "syncui";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { createJsdomAdapter } from "syncui-dom/adapter-server-jsdom";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSrc = path.basename(__dirname) === "src";
const distRoot = isSrc ? path.join(__dirname, "..", "dist") : __dirname;
const clientDir = path.join(distRoot, "client");
const workerPath = path.join(distRoot, "worker", "worker.js");

const port = Number(process.env.PORT ?? 4000);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const session = new SyncUIServerSession({
  htmlDocument: "<!doctype html><html><head></head><body></body></html>",
  url: `http://localhost:${port}`,
  adapter: (document, options) => createJsdomAdapter(document, options, { JSDOM }),
});

session.import(workerPath);

wss.on("connection", (ws) => {
  session.addConnection(createWebSocketServerTransport(ws));
});

app.use(express.static(clientDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

server.listen(port, () => {
  console.log(`examples listening on http://localhost:${port}`);
});
