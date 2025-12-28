# syncui-dom

DOM adapters for SyncUI. Provides browser, JSDOM, and Playwright adapters.

Install:
```bash
npm i syncui-dom
```

JSDOM adapter (server):
```ts
import { WebsocketDOM } from "syncui";
import { createDom } from "syncui-dom/adapter-server-jsdom";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { JSDOM } from "jsdom";

const wsDom = new WebsocketDOM({
  htmlDocument: "<!doctype html><html><body></body></html>",
  url: "http://localhost:3000",
  adapter: (doc, options) => createDom(doc, options, { JSDOM }),
});

wss.on("connection", (ws) => {
  wsDom.addConnection(createWebSocketServerTransport(ws));
});
```

Browser adapter:
```ts
import { createBrowserAdapter } from "syncui-dom/adapter-client-dom";

const adapter = createBrowserAdapter();
```

Playwright adapter:
```ts
import { createPlaywrightAdapter } from "syncui-dom/adapter-server-playwright";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();
const adapter = createPlaywrightAdapter({ page });
```
