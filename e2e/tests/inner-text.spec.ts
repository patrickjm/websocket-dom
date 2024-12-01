import { test, expect } from '@playwright/test';
import { importScript } from '../setup/import-script';

const script = `
const container = document.createElement('div');
container.id = 'test-container';
container.innerHTML = '<p>Initial <strong>HTML</strong> content</p>';
document.body.appendChild(container);

const textContainer = document.createElement('div'); 
textContainer.id = 'text-container';
textContainer.innerText = 'Initial text content';
document.body.appendChild(textContainer);

container.addEventListener('click', () => {
  container.innerHTML = '<p>Updated <em>HTML</em> after click</p>';
  textContainer.innerText = 'Updated text after click';
});
`;

test('should handle innerHTML and innerText updates', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);
  
  // Wait for containers to be created
  const htmlContainer = await page.waitForSelector('#test-container');
  const textContainer = await page.waitForSelector('#text-container');
  
  // Verify initial states
  expect(await htmlContainer.innerHTML()).toBe('<p>Initial <strong>HTML</strong> content</p>');
  expect(await textContainer.innerText()).toBe('Initial text content');
  
  // Click the HTML container to trigger updates
  await htmlContainer.click();
  
  // Verify updated states
  await expect(page.getByText('Updated HTML after click')).toBeVisible();
  await expect(page.getByText('Updated text after click')).toBeVisible();
});
