import { createClient } from "../../src/client";

export const { ws } = createClient('ws://localhost:3333');

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