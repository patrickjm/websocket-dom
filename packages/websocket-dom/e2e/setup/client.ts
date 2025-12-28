import { createClient } from "../../src/client";

const params = new URLSearchParams(window.location.search);
let sessionId = params.get("session");
if (!sessionId) {
  sessionId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
const wsUrl = `ws://localhost:3333?session=${encodeURIComponent(sessionId)}`;
const client = createClient(wsUrl);

Object.defineProperty(window as any, "ws", {
  get() {
    return client.ws;
  },
});
(window as any).wsdomClient = client;
