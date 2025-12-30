import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.SYNCUI_BASE_URL ?? "http://localhost:3333",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "yarn build && yarn workspace syncui-dom build && yarn build:e2e && yarn e2e:server",
    url: process.env.SYNCUI_BASE_URL ?? "http://localhost:3333",
    reuseExistingServer: true,
    timeout: 60000,
    stdout: "ignore",
    stderr: "ignore",
  },
});
