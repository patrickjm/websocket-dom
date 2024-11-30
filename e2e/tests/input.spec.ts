import { test, expect } from '@playwright/test';
import { importScript } from '../setup/import-script';

const script = `
const form = document.createElement('form');
form.id = 'test-form';

const input = document.createElement('input');
input.type = 'text';
input.id = 'test-input';
input.placeholder = 'Enter text';
form.appendChild(input);

const submitButton = document.createElement('button');
submitButton.type = 'submit';
submitButton.id = 'submit-button';
submitButton.innerText = 'Submit';
form.appendChild(submitButton);

const output = document.createElement('div');
output.id = 'output';
document.body.appendChild(form);
document.body.appendChild(output);

let inputEvents = [];
input.addEventListener('input', (e) => {
  inputEvents.push('input');
  output.innerText = e.target.value;
});

input.addEventListener('change', (e) => {
  inputEvents.push('change');
});

input.addEventListener('focus', () => {
  inputEvents.push('focus');
});

input.addEventListener('blur', () => {
  inputEvents.push('blur'); 
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  output.innerText = 'Form submitted with: ' + input.value;
  inputEvents.push('submit');
});

// Expose events array for testing
window.getInputEvents = () => inputEvents;
window.clearInputEvents = () => { inputEvents = []; };
`;

test.skip('should handle input element events correctly', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  // Get elements
  const input = await page.waitForSelector('#test-input');
  const output = await page.waitForSelector('#output');
  
  // Test focus
  await input.focus();
  
  // Test input and live updates
  await input.fill('Hello world');
  expect(await output.textContent()).toBe('Hello world');
  
  // Test blur
  await input.evaluate((el: HTMLInputElement) => el.blur());
  
  // Verify event sequence
  const events = await page.evaluate(() => (window as any).getInputEvents());
  expect(events).toContain('focus');
  expect(events).toContain('input');
  expect(events).toContain('blur');
  expect(events).toContain('change');
  
  // Clear events for form submission test
  await page.evaluate(() => (window as any).clearInputEvents());
  
  // Test form submission
  await page.click('#submit-button');
  expect(await output.textContent()).toBe('Form submitted with: Hello world');
  
  const submitEvents = await page.evaluate(() => (window as any).getInputEvents());
  expect(submitEvents).toContain('submit');
});

test('should handle keyboard events in input', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  const input = await page.waitForSelector('#test-input');
  
  // Test individual key presses
  await input.press('a');
  await input.press('Enter');
  await input.press('Backspace');
  
  // Verify final input state
  expect(await input.inputValue()).toBe('');
  
  // Test multiple characters
  await input.type('Test 123');
  expect(await input.inputValue()).toBe('Test 123');
});
