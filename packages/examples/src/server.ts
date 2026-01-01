import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { createDomWindow } from "syncui-dom/server";
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

const sessionId = "hn";
const session = createDomWindow({
  url: `http://localhost:${port}`,
  html: "<!doctype html><html><head></head><body></body></html>",
  sessionId,
  adapter: {
    type: "jsdom",
    deps: { JSDOM },
    options: { resources: "none" },
  },
});

session.enableAssetProxy({
  baseUrl: "https://news.ycombinator.com/",
  allowUrl: (target) => target.origin === "https://news.ycombinator.com",
});

session.domImport(workerPath);
setTimeout(() => {
  void session.navigate("https://news.ycombinator.com/");
}, 0);

wss.on("connection", (ws) => {
  session.addConnection(createWebSocketServerTransport(ws));
});

app.use(session.assetProxyRouter());

app.use(express.static(clientDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

server.listen(port, () => {
  console.log(`examples listening on http://localhost:${port}`);
});
