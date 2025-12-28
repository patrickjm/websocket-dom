export {
  createBrowserAdapter,
  type BrowserAdapterOptions,
} from "./adapter-client-dom";
export { createDom, type JsdomAdapterDeps } from "./adapter-server-jsdom";
export {
  createPlaywrightAdapter,
  type PlaywrightAdapterDeps,
} from "./adapter-server-playwright";
