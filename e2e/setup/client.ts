import { createWebsocketDOMClient } from "../../src/client";

export const ws = new WebSocket('ws://localhost:3333');
createWebsocketDOMClient(ws);

ws.onopen = () => {
  console.log('Connection opened');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Connection closed');
};

(window as any).ws = ws;