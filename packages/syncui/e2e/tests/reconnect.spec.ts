import { test, expect } from "@playwright/test";

test("should reconnect and request resync after disconnect", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__wsSendLog = [];
    (window as any).__wsInstances = [];
    const OriginalWebSocket = window.WebSocket;

    class TrackingWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).__wsInstances.push(this);
      }

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        try {
          const parsed = JSON.parse(typeof data === "string" ? data : "");
          if (parsed?.type) {
            (window as any).__wsSendLog.push(parsed.type);
          }
        } catch {
          // Ignore non-JSON payloads.
        }
        super.send(data);
      }
    }

    window.WebSocket = TrackingWebSocket as typeof WebSocket;
  });

  await page.goto("/");
  await page.waitForFunction(
    () => (window as any).wsdomClient?.state?.snapshotApplied === true
  );

  const sendLogStart = await page.evaluate(
    () => (window as any).__wsSendLog.length
  );

  await page.evaluate(() => {
    const client = (window as any).wsdomClient;
    client?.transport?.close();
  });

  await page.waitForFunction(() => (window as any).__wsInstances?.length >= 2);
  await page.waitForFunction(() => {
    const client = (window as any).wsdomClient;
    return (
      client?.transport?.isOpen?.() && client?.state?.snapshotApplied === true
    );
  });

  const newMessages = await page.evaluate((start) => {
    return (window as any).__wsSendLog.slice(start);
  }, sendLogStart);

  expect(newMessages).toContain("resync");
});
