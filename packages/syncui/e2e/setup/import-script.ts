import type { Page } from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { test } from "@playwright/test";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function importScript(page: Page, code: string) {
  const testWorkerPath = path.join(
    __dirname,
    `../dist/test-worker-${crypto.randomUUID()}.js`
  );
  const writeCode = [
    `// ${test.info().titlePath.join(" > ")}`,
    `// ${test.info().file}`,
    "",
    code,
  ].join("\n");
  await fs.promises.writeFile(testWorkerPath, writeCode, { flag: "w" });

  await page.waitForFunction(() => {
    const client = (window as any).wsdomClient;
    return !!client && client.state && client.state.snapshotApplied === true;
  });
  await page.waitForFunction(() => {
    const client = (window as any).wsdomClient;
    return !!client?.transport;
  });

  await page.evaluate(
    async ({ testWorkerPath }) => {
      const client = (window as any).wsdomClient;
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
          type: "e2e-import",
          path: testWorkerPath,
        })
      );
    },
    { testWorkerPath }
  );
}
