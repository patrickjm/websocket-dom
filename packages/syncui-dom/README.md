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
import { SyncUIServerSession } from "syncui";
import { createJsdomAdapter } from "syncui-dom/adapter-server-jsdom";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { JSDOM } from "jsdom";

const wsDom = new SyncUIServerSession({
  htmlDocument: "<!doctype html><html><body></body></html>",
  url: "http://localhost:3000",
  adapter: (doc, options) => createJsdomAdapter(doc, options, { JSDOM }),
});

wss.on("connection", (ws) => {
  wsDom.addConnection(createWebSocketServerTransport(ws));
});
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
