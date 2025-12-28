export type PlaywrightAdapterDeps = {
  page: import("@playwright/test").Page;
  htmlDocument?: string;
  url?: string;
};
