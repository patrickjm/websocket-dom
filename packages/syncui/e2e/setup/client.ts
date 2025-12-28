import { createClient } from "../../src/client";
import { initSyncuiTestBridge } from "./test-bridge";

const params = new URLSearchParams(window.location.search);
let sessionId = params.get("session");
if (!sessionId) {
  sessionId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
const wsUrl = `ws://localhost:3333?session=${encodeURIComponent(sessionId)}`;
const client = createClient(wsUrl);

initSyncuiTestBridge(client);
