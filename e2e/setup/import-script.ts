
import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function importScript(page: Page, code: string) {
  // Write code to test-worker.js file
  const testWorkerPath = path.join(__dirname, '../dist/test-worker.js');
  await fs.promises.writeFile(testWorkerPath, code);

  // Send message to import the file
  await page.evaluate(({testWorkerPath}) => {
    const ws = (window as any).ws;
    ws.send(JSON.stringify({
      type: 'e2e-import',
      path: testWorkerPath
    }));
  }, {testWorkerPath});
}
