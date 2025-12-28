# react-syncui-dom

Experimental React helpers for `syncui`. This package forwards client events into a worker so React-style event handling can run on the backend.

Status: early/WIP. The API and behavior may change.

## Install

```bash
yarn add react-syncui-dom
```

## Usage

`loadReactSyncUiDom` expects a small adapter with `import`, `on`, and `postWorkerMessage` methods. You can build one from `WebsocketDOM` like this:

```ts
import { WebsocketDOM } from "syncui";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { createDom } from "syncui-dom/adapter-jsdom";
import { JSDOM } from "jsdom";
import { loadReactSyncUiDom } from "react-syncui-dom";

const wsDom = new WebsocketDOM({
  htmlDocument: doc,
  url,
  adapter: (document, options) => createDom(document, options, { JSDOM }),
});

wsDom.addConnection(createWebSocketServerTransport(ws));

loadReactSyncUiDom({
  import: wsDom.domImport,
  on: wsDom.emitter.on.bind(wsDom.emitter),
  postWorkerMessage: wsDom.worker.postMessage.bind(wsDom.worker),
});
```

## Development

This package lives in the `syncui` monorepo under `packages/react-syncui-dom`.
