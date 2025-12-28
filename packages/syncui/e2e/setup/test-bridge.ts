import type { WebsocketDomClient } from "../../src/client";

export type SyncuiTestBridge = {
  client: WebsocketDomClient | null;
  eventLog: string[];
  wsSendLog: string[];
  wsInstances: WebSocket[];
};

export function initSyncuiTestBridge(client: WebsocketDomClient) {
  if (!window.syncuiTestBridge) {
    window.syncuiTestBridge = {
      client,
      eventLog: [],
      wsSendLog: [],
      wsInstances: [],
    };
    return;
  }
  window.syncuiTestBridge.client = client;
}

declare global {
  interface Window {
    syncuiTestBridge?: SyncuiTestBridge;
  }
}
