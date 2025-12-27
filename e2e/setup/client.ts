import { createClient } from "../../src/client";

const client = createClient('ws://localhost:3333');
const { ws } = client;

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
(window as any).wsdomClient = client;
