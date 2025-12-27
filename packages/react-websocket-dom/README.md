# react-websocket-dom

Experimental React helpers for `websocket-dom`. This package forwards client events into a worker so React-style event handling can run on the backend.

Status: early/WIP. The API and behavior may change.

## Install

```bash
yarn add react-websocket-dom
```

## Usage

`loadReactWebsocketDOM` expects a small adapter with `import`, `on`, and `postWorkerMessage` methods. You can build one from `createWebsocketDom` like this:

```ts
import { createWebsocketDom } from "websocket-dom";
import { loadReactWebsocketDOM } from "react-websocket-dom";

const wsDom = createWebsocketDom(ws, doc, url);

loadReactWebsocketDOM({
  import: wsDom.domImport,
  on: wsDom.emitter.on.bind(wsDom.emitter),
  postWorkerMessage: wsDom.worker.postMessage.bind(wsDom.worker),
});
```

## Development

This package lives in the `websocket-dom` monorepo under `packages/react-websocket-dom`.
