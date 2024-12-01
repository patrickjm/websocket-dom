import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'yarn build && yarn e2e:server',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 5000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
}); 