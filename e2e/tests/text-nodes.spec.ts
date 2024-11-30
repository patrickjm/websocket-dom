import { test, expect } from '@playwright/test';
import { importScript } from '../setup/import-script';

const script = `
const btn = document.createElement('button');
const textNode = document.createTextNode('Test Button');
btn.appendChild(textNode);
btn.id = 'test-button';
document.body.appendChild(btn);

btn.addEventListener('click', () => {
  const response = document.createElement('div');
  response.id = 'click-response';
  const responseText = document.createTextNode('Button was clicked!');
  response.appendChild(responseText);
  document.body.appendChild(response);
}); 
`;

test('should work with appended text nodes', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);
  
  // Wait for the button to be created by the backend
  const button = await page.waitForSelector('#test-button');
  
  // Verify initial state
  expect(await button.innerText()).toBe('Test Button');
  
  // Click the button
  await button.click();
  
  // Verify the response element was created
  const response = await page.waitForSelector('#click-response');
  expect(await response.innerText()).toBe('Button was clicked!');
});