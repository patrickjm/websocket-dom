import { test, expect } from '@playwright/test';
import { importScript } from '../setup/import-script';

const mutationScript = `
const container = document.createElement('div');
container.id = 'mutation-container';
document.body.appendChild(container);

const first = document.createElement('div');
first.id = 'first';
first.textContent = 'first';
const second = document.createElement('div');
second.id = 'second';
second.textContent = 'second';
const third = document.createElement('div');
third.id = 'third';
third.textContent = 'third';

container.appendChild(first);
container.appendChild(third);
container.insertBefore(second, third);

const replacement = document.createElement('span');
replacement.id = 'replacement';
replacement.textContent = 'replacement';
container.replaceChild(replacement, first);

third.setAttribute('data-tag', 'present');
third.removeAttribute('data-tag');

third.classList.add('alpha', 'beta');
third.classList.remove('beta');

third.style.setProperty('color', 'rgb(255, 0, 0)');
third.style.setProperty('background-color', 'rgb(0, 0, 0)');
third.style.removeProperty('background-color');

const fragment = document.createDocumentFragment();
const fragOne = document.createElement('span');
fragOne.id = 'frag-1';
fragOne.textContent = 'frag-one';
const fragTwo = document.createElement('span');
fragTwo.id = 'frag-2';
fragTwo.textContent = 'frag-two';
fragment.appendChild(fragOne);
fragment.appendChild(fragTwo);
container.appendChild(fragment);
`;

const identityScript = `
const container = document.createElement('div');
container.id = 'identity-container';
document.body.appendChild(container);

const moving = document.createElement('div');
moving.id = 'moving';
moving.textContent = 'attached';
container.appendChild(moving);

container.removeChild(moving);
moving.setAttribute('data-detached', 'yes');
moving.textContent = 'detached';

const other = document.createElement('div');
other.id = 'other-container';
document.body.appendChild(other);
other.appendChild(moving);
container.appendChild(moving);
`;

const blacklistScript = `
const container = document.createElement('div');
container.id = 'blacklist-container';
document.body.appendChild(container);

const link = document.createElement('a');
link.id = 'blacklist-link';
link.setAttribute('href', 'javascript:alert(1)');
link.setAttribute('onclick', 'window.__clicked = true');
link.textContent = 'link';
container.appendChild(link);

const script = document.createElement('script');
script.id = 'blocked-script';
script.textContent = 'document.body.dataset.scriptRan = \"yes\";';
document.body.appendChild(script);

const htmlContainer = document.createElement('div');
htmlContainer.id = 'html-container';
document.body.appendChild(htmlContainer);
htmlContainer.insertAdjacentHTML('beforeend', '<script id=\"html-script\">document.body.dataset.htmlScriptRan = \"yes\";</script><div id=\"html-safe\">safe</div>');
`;

test('should sync insertBefore/replaceChild/removeAttribute/classList/style mutations', async ({ page }) => {
  await page.goto('/');
  await importScript(page, mutationScript);

  const container = page.locator('#mutation-container');
  await expect(container).toBeVisible();
  await expect(container.locator(':scope > *')).toHaveCount(5);

  await expect(page.locator('#replacement')).toHaveText('replacement');
  await expect(page.locator('#second')).toHaveText('second');
  await expect(page.locator('#third')).toHaveText('third');

  await expect(page.locator('#third')).not.toHaveAttribute('data-tag');
  await expect(page.locator('#third')).toHaveClass(/alpha/);
  await expect(page.locator('#third')).not.toHaveClass(/beta/);

  await expect(page.locator('#third')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(page.locator('#third')).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');

  await expect(page.locator('#frag-1')).toHaveText('frag-one');
  await expect(page.locator('#frag-2')).toHaveText('frag-two');
});

test('should sync initial head/body/html state without scripts', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() => {
    const ws = (window as any).ws as WebSocket | undefined;
    return !!ws && ws.readyState === WebSocket.OPEN;
  });
  await page.waitForFunction(() => {
    const title = document.head?.querySelector('title');
    return title?.textContent === 'Initial Title';
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-app', 'wsdom');
  await expect(page.locator('body')).toHaveAttribute('data-state', 'initial');
  await expect(page.locator('meta[charset=\"utf-8\"]')).toHaveCount(1);
  await expect(page.locator('#init-script')).toHaveCount(0);
});

test('should preserve node identity across detach and reparent', async ({ page }) => {
  await page.goto('/');
  await importScript(page, identityScript);

  await expect(page.locator('#moving')).toHaveText('detached');
  await expect(page.locator('#moving')).toHaveAttribute('data-detached', 'yes');
  await expect(page.locator('#identity-container #moving')).toBeVisible();
});

test('should blacklist obvious executable content from sync', async ({ page }) => {
  await page.goto('/');
  await importScript(page, blacklistScript);

  await expect(page.locator('#blacklist-container')).toBeVisible();
  await expect(page.locator('#blacklist-link')).toHaveText('link');
  await expect(page.locator('#blacklist-link')).not.toHaveAttribute('onclick');
  await expect(page.locator('#blacklist-link')).not.toHaveAttribute('href', /javascript:/i);

  await expect(page.locator('#blocked-script')).toHaveCount(0);
  await expect(page.locator('#html-script')).toHaveCount(0);
  await expect(page.locator('#html-safe')).toHaveCount(0);

  const scriptRan = await page.evaluate(() => document.body.dataset.scriptRan || '');
  const htmlScriptRan = await page.evaluate(() => document.body.dataset.htmlScriptRan || '');
  expect(scriptRan).toBe('');
  expect(htmlScriptRan).toBe('');
});
