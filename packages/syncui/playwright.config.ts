import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3333",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "yarn build && yarn build:e2e && yarn e2e:server",
    url: "http://localhost:3333",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    stdout: "ignore",
    stderr: "ignore",
  },
});
