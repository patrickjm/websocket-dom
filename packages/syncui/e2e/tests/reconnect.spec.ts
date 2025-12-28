import { test, expect } from "@playwright/test";
import { gotoTestSession } from "../setup/session";

test("should reconnect and request resync after disconnect", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!window.syncuiTestBridge) {
      window.syncuiTestBridge = {
        client: null,
        eventLog: [],
        wsSendLog: [],
        wsInstances: [],
      };
    } else {
      window.syncuiTestBridge.wsSendLog = [];
      window.syncuiTestBridge.wsInstances = [];
    }
    const OriginalWebSocket = window.WebSocket;

    class TrackingWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        window.syncuiTestBridge?.wsInstances.push(this);
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        try {
          const parsed = JSON.parse(typeof data === "string" ? data : "");
          if (parsed?.type) {
            window.syncuiTestBridge?.wsSendLog.push(parsed.type);
          }
        } catch {
          // Ignore non-JSON payloads.
        }
        super.send(data);
      }
    }

    window.WebSocket = TrackingWebSocket as typeof WebSocket;
  });

  await gotoTestSession(page);
  await page.waitForFunction(
    () => window.syncuiTestBridge?.client?.state?.snapshotApplied === true
  );

  const sendLogStart = await page.evaluate(
    () => window.syncuiTestBridge?.wsSendLog.length ?? 0
  );

  await page.evaluate(() => {
    const client = window.syncuiTestBridge?.client;
    client?.transport?.close();
  });

  await page.waitForFunction(
    () => (window.syncuiTestBridge?.wsInstances.length ?? 0) >= 2
  );
  await page.waitForFunction(() => {
    const client = window.syncuiTestBridge?.client;
    return (
      client?.transport?.isOpen?.() && client?.state?.snapshotApplied === true
    );
  });

  const newMessages = await page.evaluate((start) => {
    return window.syncuiTestBridge?.wsSendLog.slice(start) ?? [];
  }, sendLogStart);

  expect(newMessages).toContain("resync");
});
