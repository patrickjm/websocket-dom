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
output.textContent = 'Output';
document.body.appendChild(output);
document.body.appendChild(form);

// Backend event listeners that update the DOM
input.addEventListener('input', (e) => {
  output.textContent = e.target.value;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  output.textContent = 'Form submitted with: ' + input.value;
});
`;

test('should handle input element events and DOM syncing correctly', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  // Wait for elements to be created
  const input = await page.waitForSelector('#test-input');
  const output = page.locator('#output');
  
  // Test that typing in input updates the output div via backend event handler
  await input.fill('Hello world');
  await expect(output).toHaveText('Hello world');
  
  // Test changing the value
  await input.fill('New text');
  await expect(output).toHaveText('New text');
  
  // Test form submission
  await page.click('#submit-button');
  await expect(output).toHaveText('Form submitted with: New text');
});

test('should handle keyboard events in input', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  const input = page.locator('#test-input');
  const output = page.locator('#output');
  
  // Test typing character by character
  await input.pressSequentially('abc');
  await expect(output).toHaveText('abc');
  
  // Clear and type new text using fill
  await input.fill('Test 123');
  await expect(output).toHaveText('Test 123');
  
  // Verify input value matches
  expect(await input.inputValue()).toBe('Test 123');
});

test('should handle selection edits and cursor behavior', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  const input = page.locator('#test-input');
  const output = page.locator('#output');

  await input.fill('abcd');
  await expect(output).toHaveText('abcd');

  await input.evaluate((el: HTMLInputElement) => {
    el.focus();
    el.setSelectionRange(1, 3);
  });
  await input.press('x');
  await expect(output).toHaveText('axd');
  expect(await input.inputValue()).toBe('axd');

  await input.evaluate((el: HTMLInputElement) => {
    el.setSelectionRange(2, 2);
  });
  await input.press('Backspace');
  await expect(output).toHaveText('ad');
  expect(await input.inputValue()).toBe('ad');

  await input.evaluate((el: HTMLInputElement) => {
    el.setSelectionRange(0, 0);
  });
  await input.press('Delete');
  await expect(output).toHaveText('d');
  expect(await input.inputValue()).toBe('d');
});

test('should handle IME composition and beforeinput flow', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  await page.waitForSelector('#test-input');
  const input = page.locator('#test-input');
  const output = page.locator('#output');

  await page.evaluate(() => {
    (window as any).eventLog = [];
    const inputEl = document.querySelector('#test-input') as HTMLInputElement;
    const record = (event: Event) => (window as any).eventLog.push(event.type);
    ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input'].forEach((type) => {
      inputEl.addEventListener(type, record);
    });
  });

  await page.evaluate(() => {
    const inputEl = document.querySelector('#test-input') as HTMLInputElement;
    inputEl.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertCompositionText',
      data: 'ime',
      isComposing: true,
    }));
    inputEl.value = 'ime';
    inputEl.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertCompositionText',
      data: 'ime',
      isComposing: true,
    }));
  });

  await expect(output).toHaveText('ime');

  await page.waitForFunction(() => {
    const log = (window as any).eventLog as string[] | undefined;
    return log
      && log.includes('compositionstart')
      && log.includes('compositionupdate')
      && log.includes('compositionend')
      && log.includes('beforeinput')
      && log.includes('input');
  });
});

test('should preserve focus/blur ordering across multiple inputs', async ({ page }) => {
  const focusScript = `
  const inputA = document.createElement('input');
  inputA.id = 'input-a';
  const inputB = document.createElement('input');
  inputB.id = 'input-b';
  const output = document.createElement('div');
  output.id = 'focus-log';
  document.body.appendChild(inputA);
  document.body.appendChild(inputB);
  document.body.appendChild(output);
  const focusLog = [];
  function record(e) {
    focusLog.push(e.type + ':' + e.target.id);
    output.textContent = focusLog.join(',');
  }
  ['focus', 'blur', 'focusin', 'focusout'].forEach((type) => {
    inputA.addEventListener(type, record);
    inputB.addEventListener(type, record);
  });
  `;

  await page.goto('/');
  await importScript(page, focusScript);

  await page.waitForSelector('#input-a');
  const inputA = page.locator('#input-a');
  const inputB = page.locator('#input-b');

  await page.evaluate(() => {
    (document.querySelector('#input-a') as HTMLInputElement).focus();
  });
  await expect(page.locator('#focus-log')).toContainText('focusin:input-a');
  await expect(page.locator('#focus-log')).toContainText('focus:input-a');

  await page.evaluate(() => {
    (document.querySelector('#input-b') as HTMLInputElement).focus();
  });
  await expect(page.locator('#focus-log')).toContainText('focusout:input-a');
  await expect(page.locator('#focus-log')).toContainText('blur:input-a');
  await expect(page.locator('#focus-log')).toContainText('focusin:input-b');
  await expect(page.locator('#focus-log')).toContainText('focus:input-b');
});

test('should sync textarea and contenteditable input', async ({ page }) => {
  const contentScript = `
  const textarea = document.createElement('textarea');
  textarea.id = 'ta';
  const editable = document.createElement('div');
  editable.id = 'ce';
  editable.setAttribute('contenteditable', 'true');
  editable.contentEditable = 'true';
  const output = document.createElement('div');
  output.id = 'ce-output';
  document.body.appendChild(textarea);
  document.body.appendChild(editable);
  document.body.appendChild(output);
  textarea.addEventListener('input', (e) => {
    output.textContent = 'ta:' + e.target.value;
  });
  editable.addEventListener('input', (e) => {
    output.textContent = 'ce:' + e.target.textContent;
  });
  `;

  await page.goto('/');
  await importScript(page, contentScript);

  const output = page.locator('#ce-output');
  const textarea = page.locator('#ta');

  await textarea.fill('hello');
  await expect(output).toHaveText('ta:hello');

  await page.waitForFunction(() => {
    const editable = document.querySelector('#ce') as HTMLDivElement | null;
    return !!editable && editable.isContentEditable;
  });

  await page.evaluate(() => {
    const editable = document.querySelector('#ce') as HTMLDivElement;
    editable.textContent = 'world';
    editable.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'world',
    }));
  });
  await expect(output).toHaveText('ce:world');
});

test('should handle form reset and invalid events', async ({ page }) => {
  const formScript = `
  const form = document.createElement('form');
  form.id = 'reset-form';
  const input = document.createElement('input');
  input.id = 'reset-input';
  input.required = true;
  const output = document.createElement('div');
  output.id = 'reset-output';
  form.appendChild(input);
  document.body.appendChild(form);
  document.body.appendChild(output);
  form.addEventListener('reset', () => {
    output.textContent = 'reset';
  });
  input.addEventListener('invalid', () => {
    output.textContent = 'invalid';
  });
  `;

  await page.goto('/');
  await importScript(page, formScript);

  const output = page.locator('#reset-output');
  const input = page.locator('#reset-input');

  await input.fill('value');
  await page.evaluate(() => {
    const form = document.querySelector('#reset-form') as HTMLFormElement;
    form.reset();
  });
  await expect(output).toHaveText('reset');

  await page.evaluate(() => {
    const input = document.querySelector('#reset-input') as HTMLInputElement;
    input.dispatchEvent(new Event('invalid', { bubbles: true, cancelable: true }));
  });
  await expect(output).toHaveText('invalid');
});

test('should tolerate rapid typing and fill sequences', async ({ page }) => {
  await page.goto('/');
  await importScript(page, script);

  const input = page.locator('#test-input');
  const output = page.locator('#output');

  await input.pressSequentially('fast');
  await expect(output).toHaveText('fast');

  const values = ['quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'];
  for (const value of values) {
    await input.fill(value);
  }
  await expect(output).toHaveText('dog');

  await input.fill('');
  await input.pressSequentially('rapid');
  await expect(output).toHaveText('rapid');
});
