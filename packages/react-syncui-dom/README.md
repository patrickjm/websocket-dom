# react-syncui-dom

Experimental React helpers for `syncui`. This package forwards client events into a worker so React-style event handling can run on the backend DOM adapter.

Status: early/WIP. The API and behavior may change.

## Install

```bash
yarn add react-syncui-dom syncui syncui-dom
```

## Usage

`loadReactSyncUiDom` expects a small adapter with `import`, `on`, and `postWorkerMessage` methods. You can build one from `SyncUIServerSession` like this:

```ts
import { SyncUIServerSession } from "syncui";
import { createWebSocketServerTransport } from "syncui/transport-ws/server";
import { createJsdomAdapter } from "syncui-dom/adapter-server-jsdom";
import { JSDOM } from "jsdom";
import { loadReactSyncUiDom } from "react-syncui-dom";

const wsDom = new SyncUIServerSession({
  htmlDocument: doc,
  url,
  adapter: (document, options) => createJsdomAdapter(document, options, { JSDOM }),
});

wsDom.addConnection(createWebSocketServerTransport(ws));

loadReactSyncUiDom({
  import: wsDom.import,
  on: wsDom.emitter.on.bind(wsDom.emitter),
  postWorkerMessage: wsDom.worker.postMessage.bind(wsDom.worker),
});
```

You can swap `createJsdomAdapter` for `createPlaywrightAdapter` if you want Playwright-backed DOM.

## Development

This package lives in the `syncui` monorepo under `packages/react-syncui-dom`.
