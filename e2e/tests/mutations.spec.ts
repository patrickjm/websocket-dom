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

test('should preserve node identity across detach and reparent', async ({ page }) => {
  await page.goto('/');
  await importScript(page, identityScript);

  await expect(page.locator('#moving')).toHaveText('detached');
  await expect(page.locator('#moving')).toHaveAttribute('data-detached', 'yes');
  await expect(page.locator('#identity-container #moving')).toBeVisible();
});
