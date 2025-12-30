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
      };
    } else {
      window.syncuiTestBridge.wsSendLog = [];
    }
    const OriginalWebSocket = window.WebSocket;

    class TrackingWebSocket extends OriginalWebSocket {
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
    () => {
      const client = window.syncuiTestBridge?.client;
      if (!client?.transport?.isOpen?.()) {
        return false;
      }
      if (client.state?.snapshotApplied !== true) {
        client.resync?.();
        return false;
      }
      return true;
    },
    { timeout: 60000 }
  );

  const newMessages = await page.evaluate((start) => {
    return window.syncuiTestBridge?.wsSendLog.slice(start) ?? [];
  }, sendLogStart);

  expect(newMessages).toContain("resync");
});
