import type { Page } from "@playwright/test";

export async function evalScript(page: Page, code: string) {
  await page.waitForFunction(() => {
    const client = window.syncuiTestBridge?.client;
    return !!client && client.state && client.state.snapshotApplied === true;
  });
  await page.waitForFunction(() => {
    const client = window.syncuiTestBridge?.client;
    return !!client?.transport;
  });

  await page.evaluate(
    async ({ code }) => {
      const client = window.syncuiTestBridge?.client;
      const transport = client?.transport;
      if (!transport) {
        throw new Error("No transport available");
      }
      if (!transport.isOpen()) {
        await new Promise<void>((resolve, reject) => {
          const unsubOpen = transport.onOpen?.(() => {
            cleanup();
            resolve();
          });
          const unsubError = transport.onError?.(() => {
            cleanup();
            reject(new Error("WebSocket error"));
          });
          const cleanup = () => {
            unsubOpen?.();
            unsubError?.();
          };
        });
      }
      transport.send(
        JSON.stringify({
          type: "e2e-eval",
          code,
        })
      );
    },
    { code }
  );
}
