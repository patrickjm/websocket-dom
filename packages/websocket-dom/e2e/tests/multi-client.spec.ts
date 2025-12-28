import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { importScript } from "../setup/import-script";

const multiClientScript = `
const container = document.createElement('section');
container.id = 'multi-client-container';

const status = document.createElement('div');
status.id = 'shared-status';
status.textContent = 'ready';

const input = document.createElement('input');
input.id = 'shared-input';
input.setAttribute('type', 'text');

const output = document.createElement('div');
output.id = 'shared-output';
output.textContent = '';

input.addEventListener('input', () => {
  output.textContent = input.value;
});

container.appendChild(status);
container.appendChild(input);
container.appendChild(output);
document.body.appendChild(container);
`;

test("should sync mutations and events across multiple clients", async ({
  page,
  context,
}) => {
  const pageA = page;
  const pageB = await context.newPage();
  const sessionId = crypto.randomUUID();

  await pageA.goto(`/?session=${sessionId}`);
  await pageB.goto(`/?session=${sessionId}`);

  await pageA.waitForFunction(
    () => (window as any).wsdomClient?.state?.snapshotApplied === true
  );
  await pageB.waitForFunction(
    () => (window as any).wsdomClient?.state?.snapshotApplied === true
  );

  await importScript(pageA, multiClientScript);

  await expect(pageA.locator("#shared-status")).toHaveText("ready");
  await expect(pageB.locator("#shared-status")).toHaveText("ready");

  await pageA.fill("#shared-input", "hello");
  await expect(pageA.locator("#shared-output")).toHaveText("hello");
  await expect(pageB.locator("#shared-output")).toHaveText("hello");

  await pageB.fill("#shared-input", "world");
  await expect(pageA.locator("#shared-output")).toHaveText("world");
  await expect(pageB.locator("#shared-output")).toHaveText("world");
});
