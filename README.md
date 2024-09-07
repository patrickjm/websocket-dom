# websocket-dom

![NPM Version](https://img.shields.io/npm/v/websocket-dom)

Experimental 2-way sync between backend JSDOM and frontend DOM using WebSockets.

Fully control the client document and respond to user events from the backend.

**Compatibility**:
- ESM only
- NodeJS full support
- Bun/Deno do not work

## Usage

Installation:
```bash
npm i websocket-dom
# or
yarn add websocket-dom
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

// create a new websocket-dom for each connection
wss.on('connection', (ws) => {
  // pass the websocket and the initial document
  const doc = '<!DOCTYPE html><html><body></body></html>';
  const { window } = createWebsocketDom(ws, doc, { url: 'http://localhost:3000' });

  const document = window.document;
  const btn = document.createElement('button');
  btn.innerText = 'Click me';
  btn.addEventListener('click', () => {
    console.log('hello'); // <-- This will be printed in the server terminal
  });
  document.body.appendChild(btn);
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
```

To set up the browser client, you just need to import `websocket-dom/client`.

Since this is experimental, only port 3000 is supported until more config options are added.

Assuming you're using Vite, you can do this:

```html
<!DOCTYPE html>
<html>
<body>
  <script type="module" src="websocket-dom/client"></script>
</body>

</html>
```


## How it works

On the backend, JSDOM is wrapped in a Proxy. When DOM mutations are made (creating, removing, or updating nodes), they're serialized and sent to the frontend where they're patched to the browser's DOM. 

The frontend captures all events (clicks, etc) and sends them back to the server where they're dispatched to JSDOM. The cycle repeats.

This can only be done under the assumption that the client is only updated from this library (no custom scripts).

## Open problems / todo
- [ ] Manual flush / reset / sync
- [ ] Full JSDOM api coverage
- [ ] Multiple open connections on the same session
- [ ] Event side effects (Input event -> value change -> cursor move)
- [ ] Client reconnection

## Development

Unfortunately, both bun and node are required to fully build this package at the moment.

But just to develop, only node >= 22 is needed.