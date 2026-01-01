# syncui-dom

DOM adapters for SyncUI. Provides client DOM and server DOM adapters (JSDOM + Playwright).

Install:
```bash
npm i syncui-dom
```

`jsdom` and `@playwright/test` are optional peer dependencies. Install the one you need for your server adapter.

## Client vs server adapters

Client DOM:
```ts
import { createClientDomAdapter } from "syncui-dom/adapter-client-dom";
```

Server (JSDOM):
```ts
import { createJsdomAdapter } from "syncui-dom/adapter-server-jsdom";
```

Server (Playwright):
```ts
import { createPlaywrightAdapter } from "syncui-dom/adapter-server-playwright";
```

JSDOM adapter (server):
```ts
import { SyncUISession } from "syncui";
import { createJsdomAdapter } from "syncui-dom/adapter-server-jsdom";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { JSDOM } from "jsdom";

const wsDom = new SyncUISession({
  htmlDocument: "<!doctype html><html><body></body></html>",
  url: "http://localhost:3000",
  adapter: (doc, options) => createJsdomAdapter(doc, options, { JSDOM }),
});

wss.on("connection", (ws) => {
  wsDom.addConnection(createWebSocketServerTransport(ws));
});
```

DOM window wrapper (server):
```ts
import { createDomWindow } from "syncui-dom/server";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { JSDOM } from "jsdom";

const window = createDomWindow({
  url: "http://localhost:3000",
  html: "<!doctype html><html><body></body></html>",
  adapter: { type: "jsdom", deps: { JSDOM } },
});

wss.on("connection", (ws) => {
  window.addConnection(createWebSocketServerTransport(ws));
});
```

Window lifecycle (server):
```ts
window.enableAssetProxy({
  baseUrl: "https://example.com",
  allowUrl: (target) => target.origin === "https://example.com",
});

// Mount the proxy routes without hardcoding the path shape.
app.use(window.assetProxyRouter());

window.domImport("/path/to/worker.js");
await window.navigate("https://example.com/page");

// When the window is no longer needed:
window.terminate();
```

Browser adapter:
```ts
import { createClientDomAdapter } from "syncui-dom/adapter-client-dom";

const adapter = createClientDomAdapter();
```

Playwright adapter:
```ts
import { createPlaywrightAdapter } from "syncui-dom/adapter-server-playwright";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();
const adapter = createPlaywrightAdapter({ page });
```
