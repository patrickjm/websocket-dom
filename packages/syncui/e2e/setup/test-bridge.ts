import type { SyncUIClient } from "../../src/client";

export type SyncuiTestBridge = {
  client: SyncUIClient | null;
  eventLog: string[];
  wsSendLog: string[];
};

export function initSyncuiTestBridge(client: SyncUIClient) {
  if (!window.syncuiTestBridge) {
    window.syncuiTestBridge = {
      client,
      eventLog: [],
      wsSendLog: [],
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
