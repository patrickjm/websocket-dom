# react-syncui-dom

Experimental React helpers for `syncui`. This package forwards client events into a worker so React-style event handling can run on the backend.

Status: early/WIP. The API and behavior may change.

## Install

```bash
yarn add react-syncui
```

## Usage

`loadReactWebsocketDOM` expects a small adapter with `import`, `on`, and `postWorkerMessage` methods. You can build one from `WebsocketDOM` like this:

```ts
import { WebsocketDOM, createWebSocketServerTransport } from "syncui";
import { loadReactWebsocketDOM } from "react-syncui";

const wsDom = new WebsocketDOM({
  htmlDocument: doc,
  url,
});

wsDom.addConnection(createWebSocketServerTransport(ws));

loadReactWebsocketDOM({
  import: wsDom.domImport,
  on: wsDom.emitter.on.bind(wsDom.emitter),
  postWorkerMessage: wsDom.worker.postMessage.bind(wsDom.worker),
});
```

## Development

This package lives in the `syncui` monorepo under `packages/react-syncui-dom`.
