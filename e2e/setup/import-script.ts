import type { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { test } from '@playwright/test';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function importScript(page: Page, code: string) {
  const testWorkerPath = path.join(__dirname, `../dist/test-worker-${crypto.randomUUID()}.js`);
  const writeCode = [
    `// ${test.info().titlePath.join(' > ')}`,
    `// ${test.info().file}`,
    '',
    code
  ].join('\n');
  await fs.promises.writeFile(testWorkerPath, writeCode, { flag: 'w' });

  await page.evaluate(({testWorkerPath}) => {
    const ws = (window as any).ws;
    ws.send(JSON.stringify({
      type: 'e2e-import',
      path: testWorkerPath
    }));
  }, {testWorkerPath});
}
