# websocket-dom

![NPM Version](https://img.shields.io/npm/v/websocket-dom)

Experimental partial 2-way sync between backend JSDOM and frontend DOM using WebSockets.

Fully control the client document and respond to user events from the backend.

**Compatibility**: NodeJS v22+ with ESM.

## Usage

Installation:
```bash
npm i websocket-dom
# or
yarn add websocket-dom
```

First, create your app code. This will run in a web-worker in the backend, but it feels just like client-side Javascript. 

In your build step, you need to make sure the worker.js file is compiled to the `dist` folder separately as its own entrypoint.

Create `worker.ts`:

```ts
const btn = document.createElement('button');
btn.innerText = 'Click me';
btn.addEventListener('click', () => {
  console.log('hello'); // <-- This will be printed in the server terminal
});
document.body.appendChild(btn);
```

Then set up the server (assuming you're using Express):

```ts
import { createWebsocketDom } from 'websocket-dom';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// create a new websocket-dom for each connection
wss.on('connection', (ws) => {
  // pass the websocket and the initial document
  const doc = '<!DOCTYPE html><html><body></body></html>';
  const { domImport, terminate } = createWebsocketDom(ws, doc, { url: 'http://localhost:3000' });

  ws.on('close', () => {
    terminate();
  });

  // This must be a relative path to the compiled worker.js file in the dist folder,
  // NOT the typescript file.
  domImport(path.join(__dirname.replace('src', 'dist'), 'worker.js'));
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
```

Next we need to set up the client code that actually runs in the browser. This will require a bundler. It will automatically create a websocket connection, watch for client-side events, and update the DOM from backend mutations:

```ts
import { createClient } from "websocket-dom/client";

export const { ws } = createClient('ws://localhost:3000');
```

## How it works

On the backend, we create an isolated node worker that runs JSDOM. JSDOM classes are patched so that before mutations are applied (createElement, appendChild, etc.), they're intercepted, serialized, and sent to the frontend.

The frontend receives the mutations and applies them to the DOM. User events like clicks, keyboard inputs, etc. are sent back over websocket to the backend where they're dispatched to JSDOM.

To keep the two sides in sync, it's strongly recommended that the only client-side code you load is from this library.

## Open problems / todo
- [ ] Manual flush / reset / sync
- [ ] Comprehensive JSDOM api coverage
- [ ] Multiple open connections on the same session
- [ ] Event side effects (Input event -> value change -> cursor move)
- [ ] Client reconnection
- [ ] Experiment with client-sided dom mutation intercept
- [ ] Embedding other jsdom documents as elements
- [ ] Accessing element positions and sizes from the backend

## Development

Unfortunately, both bun and node are required to fully build this package at the moment.

But just to develop, only node >= 22 is needed.

## Compatibility

- Why no Bun?
  - jsdom depends on node-canvas which is not supported by Bun, see: https://github.com/oven-sh/bun/issues/5835