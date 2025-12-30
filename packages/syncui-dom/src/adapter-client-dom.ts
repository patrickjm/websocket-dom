import { EventEmitter } from "node:events";
import type { UiAdapter } from "syncui/core/adapter/types";
import type { SerializedEvent } from "syncui/core/protocol/events";
import type { DomEmitter } from "syncui/core/ops/instructions";
import type { SnapshotMessage } from "syncui/core/protocol/messages";
import { NodeStash } from "syncui/core/model/nodes";
import { dispatchEvent } from "./adapter/dom/events";
import { extendPrototypes } from "./adapter/dom/prototypes";
import { sanitizeElement, shouldSkipAttribute } from "./adapter/dom/sanitize";
import type { AdapterWindow } from "./adapter/dom/window-types";

export type BrowserAdapterOptions = {
  window?: AdapterWindow;
};

export function createClientDomAdapter(
  options: BrowserAdapterOptions = {}
): UiAdapter {
  const defaultWindow =
    typeof window === "undefined" ? null : (window as AdapterWindow);
  const adapterWindow = options.window ?? defaultWindow;
  if (!adapterWindow) {
    throw new Error("Browser adapter requires a Window instance.");
  }
  const windowRef = adapterWindow as AdapterWindow;
  const emitter = new EventEmitter() as DomEmitter;
  const nodes = new NodeStash(windowRef);
  extendPrototypes(windowRef, nodes, emitter);

  function domImport(moduleUrl: string) {
    // syncui-allow-inline-import: client adapter loads worker script URLs on demand.
    import(moduleUrl).catch((err) => {
      console.error(`Error importing ${moduleUrl}: ${String(err)}`);
    });
  }

  function terminate() {
    // No-op for browser adapter.
  }

  async function evalString(code: string): Promise<unknown> {
    const windowEval = (
      windowRef as unknown as { eval?: (code: string) => unknown }
    ).eval;
    if (typeof windowEval === "function") {
      return windowEval(code);
    }
    return Function(code)();
  }

  function collectAttributes(element: Element | null): [string, string][] {
    if (!element) {
      return [];
    }
    const attrs: [string, string][] = [];
    for (const attr of Array.from(element.attributes)) {
      if (shouldSkipAttribute(attr.name, attr.value)) {
        continue;
      }
      attrs.push([attr.name, attr.value]);
    }
    return attrs;
  }

  function getSnapshot(): Promise<SnapshotMessage> {
    const { document } = windowRef;
    const snapshot: SnapshotMessage = {
      type: "snapshot",
      htmlAttributes: collectAttributes(document.documentElement),
      headAttributes: collectAttributes(document.head),
      bodyAttributes: collectAttributes(document.body),
      headHtml: document.head ? sanitizeElement(document.head).innerHTML : "",
      bodyHtml: document.body ? sanitizeElement(document.body).innerHTML : "",
    };
    return Promise.resolve(snapshot);
  }

  return {
    emitter,
    dispatchEvent: (event: SerializedEvent) =>
      dispatchEvent(nodes, emitter, windowRef, event),
    domImport,
    terminate,
    evalString,
    getSnapshot,
  };
}
