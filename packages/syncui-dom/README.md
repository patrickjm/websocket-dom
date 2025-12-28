# syncui-dom

DOM adapters for SyncUI. Provides browser, JSDOM, and Playwright adapters.

Install:
```bash
npm i syncui-dom
```

JSDOM adapter (server):
```ts
import { WebsocketDOM } from "syncui";
import { createDom } from "syncui-dom/adapter-jsdom";
import { createWebSocketServerTransport } from "syncui";
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
import { createBrowserAdapter } from "syncui-dom/adapter-dom";

const adapter = createBrowserAdapter();
```
