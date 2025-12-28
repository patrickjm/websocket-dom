import type { UiAdapter } from "syncui/core/adapter/types";

export type PlaywrightAdapterDeps = {
  page: import("@playwright/test").Page;
};

export function createPlaywrightAdapter(
  _deps: PlaywrightAdapterDeps
): UiAdapter {
  throw new Error("Playwright adapter is not implemented yet.");
}
