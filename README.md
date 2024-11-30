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

In your build step, you need to make sure the resulting `worker.js` file is compiled to the `dist` folder separately as its own entrypoint.

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
  const wsDom = new WebsocketDOM({
    websocket: ws,
    htmlDocument: doc,
    url: 'http://localhost:3000'
  })

  ws.on('close', () => {
    // This will destroy the backend dom upon disconnect.
    // But you can support client reconnection by updating the websocket connection:
    // wsDom.setWebsocket(newWs);
    wsDom.terminate();
  });

  // Import your compiled worker.js file
  wsDom.import(path.join(__dirname.replace('src', 'dist'), 'worker.js'));
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

The frontend receives the mutations and applies them to the real DOM. User events like clicks, keyboard inputs, etc. are sent back over websocket to the backend where they're dispatched to JSDOM.

To keep the two sides in sync, it's strongly recommended that the only client-side code you load is from this library.

## Limitations

- The backend dom is not a real headless browser. It runs on jsdom, so any limitations of jsdom will apply here too (e.g. no browser history, no contenteditable, etc.)
- Within jsdom, websocket-dom does not have full API coverage yet. There may be some events or DOM mutations that do not sync properly

## Open problems / todo
- [ ] Manual flush / reset / sync
- [ ] Comprehensive JSDOM api coverage
- [ ] Multiple open connections on the same session
- [ ] Event side effects (Input event -> value change -> cursor move)
- [ ] Experiment with client-sided dom mutation intercept
- [ ] Embedding other jsdom documents as elements
- [ ] Accessing element positions and sizes from the backend

## Compatibility

- Why no Bun or Deno support? Websocket-dom heavily depends on jsdom which is not supported by Deno or Bun
    - Bun: jsdom depends on node-canvas which is not supported by Bun, see: https://github.com/oven-sh/bun/issues/5835