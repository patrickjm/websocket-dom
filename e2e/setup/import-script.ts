import type { Page } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { test } from '@playwright/test';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function importScript(page: Page, code: string) {
  const testWorkerPath = path.join(__dirname, `../dist/test-worker-${crypto.randomUUID()}.js`);
  const writeCode = [
    `// ${test.info().titlePath.join(' > ')}`,
    `// ${test.info().file}`,
    '',
    code,
  ].join('\n');
  await fs.promises.writeFile(testWorkerPath, writeCode, { flag: 'w' });

  await page.evaluate(async ({ testWorkerPath }) => {
    const ws = (window as any).ws as WebSocket;
    if (ws.readyState !== WebSocket.OPEN) {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('WebSocket error'));
        };
        const cleanup = () => {
          ws.removeEventListener('open', onOpen);
          ws.removeEventListener('error', onError);
        };
        ws.addEventListener('open', onOpen);
        ws.addEventListener('error', onError);
      });
    }
    ws.send(JSON.stringify({
      type: 'e2e-import',
      path: testWorkerPath,
    }));
  }, { testWorkerPath });
}
