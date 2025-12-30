import { EventEmitter } from "node:events";
import type { UiAdapter } from "syncui/core/adapter/types";
import type { SerializedEvent } from "syncui/core/protocol/events";
import type { DomEmitter } from "syncui/core/ops/instructions";
import type { SnapshotMessage } from "syncui/core/protocol/messages";
import type { AdapterWindow } from "./window-types";
import { NodeStash } from "syncui/core/model/nodes";
import { dispatchEvent } from "./events";
import { extendPrototypes } from "./prototypes";
import { createBrowserStorage } from "./utils";
import { sanitizeElement, shouldSkipAttribute } from "./sanitize";

type GlobalScope = {
  window?: Window;
  document?: Document;
  Node?: typeof Node;
  Element?: typeof Element;
  Event?: typeof Event;
  EventTarget?: typeof EventTarget;
  XMLSerializer?: typeof XMLSerializer;
  XPathResult?: typeof XPathResult;
  XPathEvaluator?: typeof XPathEvaluator;
  DOMParser?: typeof DOMParser;
  localStorage?: Storage;
  sessionStorage?: Storage;
};

const getGlobalScope = (): GlobalScope => globalThis as unknown as GlobalScope;

let globalsQueue: Promise<unknown> = Promise.resolve();

export type JsdomAdapterDeps = {
  JSDOM: typeof import("jsdom").JSDOM;
};

export type JsdomAdapterOptions = {
  resources?: "usable" | "none";
};

export function createJsdomAdapter(
  doc: string,
  { url }: { url: string },
  deps: JsdomAdapterDeps,
  options: JsdomAdapterOptions = {}
): UiAdapter {
  if (!deps?.JSDOM) {
    throw new Error("JSDOM dependency is required for adapter-server-jsdom.");
  }
  const resources =
    options.resources === "none" ? undefined : options.resources ?? "usable";
  const emitter = new EventEmitter() as DomEmitter;
  const dom = new deps.JSDOM(doc, {
    url,
    pretendToBeVisual: true,
    contentType: "text/html",
    runScripts: "outside-only",
    resources,
  });
  const adapterWindow = dom.window as unknown as AdapterWindow;
  const nodes = new NodeStash(adapterWindow);
  extendPrototypes(adapterWindow, nodes, emitter);

  const localStorage = createBrowserStorage();
  const sessionStorage = createBrowserStorage();

  const setGlobals = () => {
    const scope = getGlobalScope();
    scope.window = dom.window as unknown as Window;
    scope.document = dom.window.document;
    scope.Node = dom.window.Node;
    scope.Element = dom.window.Element;
    scope.Event = dom.window.Event;
    scope.EventTarget = dom.window.EventTarget;
    scope.XMLSerializer = dom.window.XMLSerializer;
    scope.XPathResult = dom.window.XPathResult;
    scope.XPathEvaluator = dom.window.XPathEvaluator;
    scope.DOMParser = dom.window.DOMParser;
    scope.localStorage = localStorage;
    scope.sessionStorage = sessionStorage;
  };

  const withGlobals = <T>(fn: () => T): T => {
    const scope = getGlobalScope();
    const previous = {
      window: scope.window,
      document: scope.document,
      Node: scope.Node,
      Element: scope.Element,
      Event: scope.Event,
      EventTarget: scope.EventTarget,
      XMLSerializer: scope.XMLSerializer,
      XPathResult: scope.XPathResult,
      XPathEvaluator: scope.XPathEvaluator,
      DOMParser: scope.DOMParser,
      localStorage: scope.localStorage,
      sessionStorage: scope.sessionStorage,
    };
    setGlobals();
    try {
      return fn();
    } finally {
      Object.assign(scope, previous);
    }
  };

  const withGlobalsAsync = async <T>(fn: () => Promise<T>): Promise<T> => {
    const scope = getGlobalScope();
    const previous = {
      window: scope.window,
      document: scope.document,
      Node: scope.Node,
      Element: scope.Element,
      Event: scope.Event,
      EventTarget: scope.EventTarget,
      XMLSerializer: scope.XMLSerializer,
      XPathResult: scope.XPathResult,
      XPathEvaluator: scope.XPathEvaluator,
      DOMParser: scope.DOMParser,
      localStorage: scope.localStorage,
      sessionStorage: scope.sessionStorage,
    };
    setGlobals();
    try {
      return await fn();
    } finally {
      Object.assign(scope, previous);
    }
  };

  const enqueueGlobals = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = globalsQueue.then(fn);
    globalsQueue = next.catch(() => {});
    return next;
  };

  function domImport(moduleUrl: string) {
    void enqueueGlobals(() =>
      withGlobalsAsync(async () => {
        // biome-ignore lint/plugin: server adapter loads user worker modules on demand.
        await import(moduleUrl);
      })
    ).catch((err) => {
      console.error(`Error importing ${moduleUrl}: ${String(err)}`);
    });
  }

  function terminate() {
    dom.window.close();
  }

  async function evalString(code: string): Promise<unknown> {
    return enqueueGlobals(async () =>
      withGlobals(async () => {
        const result = dom.window.eval(code);
        if (result && typeof (result as Promise<unknown>).then === "function") {
          return await result;
        }
        return result;
      })
    );
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
    return enqueueGlobals(async () =>
      withGlobals(() => {
        const { document } = dom.window;
        return {
          type: "snapshot",
          htmlAttributes: collectAttributes(document.documentElement),
          headAttributes: collectAttributes(document.head),
          bodyAttributes: collectAttributes(document.body),
          headHtml: document.head
            ? sanitizeElement(document.head).innerHTML
            : "",
          bodyHtml: document.body
            ? sanitizeElement(document.body).innerHTML
            : "",
        };
      })
    );
  }

  return {
    emitter,
    dispatchEvent: (event: SerializedEvent) =>
      void enqueueGlobals(async () =>
        withGlobals(() => dispatchEvent(nodes, emitter, adapterWindow, event))
      ),
    domImport,
    terminate,
    evalString,
    getSnapshot,
  };
}
