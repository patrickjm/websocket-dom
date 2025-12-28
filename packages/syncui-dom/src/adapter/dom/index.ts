import { EventEmitter } from "events";
import type { UiAdapter } from "syncui/core/adapter/types";
import type { SerializedEvent } from "syncui/core/protocol/events";
import { type DomEmitter } from "syncui/core/ops/instructions";
import type { SnapshotMessage } from "syncui/core/protocol/messages";
import type { AdapterWindow } from "./window-types";
import { NodeStash } from "syncui/core/model/nodes";
import { dispatchEvent } from "./events";
import { extendPrototypes } from "./prototypes";
import { createBrowserStorage } from "./utils";
import { sanitizeElement, shouldSkipAttribute } from "./sanitize";

export type JsdomAdapterDeps = {
  JSDOM: typeof import("jsdom").JSDOM;
};

export function createDom(
  doc: string,
  { url }: { url: string },
  deps: JsdomAdapterDeps
): UiAdapter {
  if (!deps?.JSDOM) {
    throw new Error("JSDOM dependency is required for adapter-jsdom.");
  }
  const emitter = new EventEmitter() as DomEmitter;
  const dom = new deps.JSDOM(doc, {
    url,
    pretendToBeVisual: true,
    contentType: "text/html",
    runScripts: "outside-only",
    resources: "usable",
  });
  const adapterWindow = dom.window as unknown as AdapterWindow;
  const nodes = new NodeStash(adapterWindow as any);
  extendPrototypes(adapterWindow, nodes, emitter);

  const localStorage = createBrowserStorage();
  const sessionStorage = createBrowserStorage();

  const setGlobals = () => {
    const globalThisAny = globalThis as any;
    globalThisAny.window = dom.window;
    globalThisAny.document = dom.window.document;
    globalThisAny.Node = dom.window.Node;
    globalThisAny.Element = dom.window.Element;
    globalThisAny.Event = dom.window.Event;
    globalThisAny.EventTarget = dom.window.EventTarget;
    globalThisAny.XMLSerializer = dom.window.XMLSerializer;
    globalThisAny.XPathResult = dom.window.XPathResult;
    globalThisAny.XPathEvaluator = dom.window.XPathEvaluator;
    globalThisAny.localStorage = localStorage;
    globalThisAny.sessionStorage = sessionStorage;
  };

  const withGlobals = <T>(fn: () => T): T => {
    const globalThisAny = globalThis as any;
    const previous = {
      window: globalThisAny.window,
      document: globalThisAny.document,
      Node: globalThisAny.Node,
      Element: globalThisAny.Element,
      Event: globalThisAny.Event,
      EventTarget: globalThisAny.EventTarget,
      XMLSerializer: globalThisAny.XMLSerializer,
      XPathResult: globalThisAny.XPathResult,
      XPathEvaluator: globalThisAny.XPathEvaluator,
      localStorage: globalThisAny.localStorage,
      sessionStorage: globalThisAny.sessionStorage,
    };
    setGlobals();
    try {
      return fn();
    } finally {
      Object.assign(globalThisAny, previous);
    }
  };

  const withGlobalsAsync = async <T>(fn: () => Promise<T>): Promise<T> => {
    const globalThisAny = globalThis as any;
    const previous = {
      window: globalThisAny.window,
      document: globalThisAny.document,
      Node: globalThisAny.Node,
      Element: globalThisAny.Element,
      Event: globalThisAny.Event,
      EventTarget: globalThisAny.EventTarget,
      XMLSerializer: globalThisAny.XMLSerializer,
      XPathResult: globalThisAny.XPathResult,
      XPathEvaluator: globalThisAny.XPathEvaluator,
      localStorage: globalThisAny.localStorage,
      sessionStorage: globalThisAny.sessionStorage,
    };
    setGlobals();
    try {
      return await fn();
    } finally {
      Object.assign(globalThisAny, previous);
    }
  };

  function domImport(moduleUrl: string) {
    void withGlobalsAsync(async () => {
      await import(moduleUrl);
    }).catch((err) => {
      console.error(`Error importing ${moduleUrl}: ${String(err)}`);
    });
  }

  function terminate() {
    dom.window.close();
  }

  async function evalString(code: string): Promise<unknown> {
    return withGlobals(() => dom.window.eval(code));
  }

  function collectAttributes(element: Element | null): [string, string][] {
    if (!element) {
      return [];
    }
    const attrs: [string, string][] = [];
    Array.from(element.attributes).forEach((attr) => {
      if (shouldSkipAttribute(attr.name, attr.value)) {
        return;
      }
      attrs.push([attr.name, attr.value]);
    });
    return attrs;
  }

  function getSnapshot(): Promise<SnapshotMessage> {
    const { document } = dom.window;
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
      dispatchEvent(nodes, emitter, adapterWindow, event),
    domImport,
    terminate,
    evalString,
    getSnapshot,
  };
}
