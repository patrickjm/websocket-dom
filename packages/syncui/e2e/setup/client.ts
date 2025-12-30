import { SyncUIClient } from "../../src/client";
import { initSyncuiTestBridge } from "./test-bridge";

const params = new URLSearchParams(window.location.search);
let sessionId = params.get("session");
if (!sessionId) {
  sessionId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${
  window.location.host
}?session=${encodeURIComponent(sessionId)}`;
const client = new SyncUIClient(wsUrl, {
  reconnect: {
    baseDelayMs: 100,
    maxDelayMs: 1000,
    jitterRatio: 0,
  },
});
client.connect();

initSyncuiTestBridge(client);
