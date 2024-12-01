import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import { deserializeEvent } from "../event";
import { resolveXPath } from "../shared-utils";
import { SetProperty, type DomEmitter } from "./mutations";
import { NodeStash } from "./nodes";
import { extendPrototypes } from "./prototypes";
import { createBrowserStorage, type MessageFromWorker, type MessageToWorker } from "./utils";
import { simulateEvent } from "./simulate-event";

let nodes: NodeStash;
let dom: JSDOM;
const emitter = new EventEmitter() as DomEmitter;

// We want to override the global postMessage and addEventListener etc.
// to have full control over message passing.
const _postMessage: (msg: MessageFromWorker) => void = globalThis.postMessage;
const _addEventListener: typeof globalThis.addEventListener = globalThis.addEventListener;
const _removeEventListener: typeof globalThis.removeEventListener = globalThis.removeEventListener;

let messageListeners: Set<(ev: MessageEvent<MessageFromWorker>) => void> = new Set();

// @ts-expect-error
globalThis.addEventListener = (type, listener) => {
  if (type === "message") {
    messageListeners.add(listener);
  } else {
    _addEventListener(type, listener);
  }
}

// @ts-expect-error
globalThis.removeEventListener = (type, listener) => {
  if (type === "message") {
    messageListeners.delete(listener);
  } else {
    _removeEventListener(type, listener);
  }
}

globalThis.postMessage = (msg: any) => {
  _postMessage({ type: "worker-message", jsonString: JSON.stringify(msg) });
}

// Initialize the dom globally
function initDom(doc: string, url: string) {
  let globalThisAny = globalThis as any;
  dom = new JSDOM(
    doc,
    {
      url,
      pretendToBeVisual: true,
      contentType: 'text/html',
      runScripts: "outside-only",
      resources: "usable",
      beforeParse(window) {
        nodes = new NodeStash(window);
        extendPrototypes(window, nodes, emitter);
      },
    }
  );
  globalThisAny.window = dom.window;
  globalThisAny.document = dom.window.document;
  globalThisAny.Node = dom.window.Node;
  globalThisAny.Element = dom.window.Element;
  globalThisAny.Event = dom.window.Event;
  globalThisAny.EventTarget = dom.window.EventTarget;
  globalThisAny.XMLSerializer = dom.window.XMLSerializer;
  globalThisAny.XPathResult = dom.window.XPathResult;
  globalThisAny.XPathEvaluator = dom.window.XPathEvaluator;
  globalThisAny.localStorage = createBrowserStorage();
  globalThisAny.sessionStorage = createBrowserStorage();

  emitter.on("mutation", (mutation) => {
    _postMessage({ type: "mutation", mutation } as MessageFromWorker);
  });
}

// Send the body.innerHTML to the client
function sendBodyInnerHTML() {
  _postMessage({
    type: "mutation",
    mutation: SetProperty.serialize({
      ref: { type: 'xpath', xpath: '/html/body' },
      name: 'innerHTML',
      value: dom.window.document.body.innerHTML,
    })
  } as MessageFromWorker);
}

// Allow logging to the client from the worker
function logToClient(level: "log" | "debug" | "warn" | "error" | "trace", ...args: unknown[]) {
  _postMessage({ type: "client-log", jsonStrings: args?.map(arg => JSON.stringify(arg)) ?? [], level } as MessageFromWorker);
}
// see worker.d.ts
(console as any).client = {
  log: logToClient.bind(null, "log"),
  debug: logToClient.bind(null, "debug"),
  warn: logToClient.bind(null, "warn"),
  error: logToClient.bind(null, "error"),
  trace: logToClient.bind(null, "trace"),
}


// Handle messages from the client
_addEventListener("message", (event: MessageEvent<MessageToWorker>) => {
  if (event.data.type === "init-dom") {
    const { doc, url } = event.data;
    initDom(doc, url);
  } else if (event.data.type === "client-event") {
    simulateEvent(event.data.event, dom.window);
  } else if (event.data.type === "dom-import") {
    // Received a request to import a js module
    const { url } = event.data;
    import(url)
      .catch((err) => {
        console.error(`WebsocketDOM Worker: Error importing ${url}: ${err}`);
      });
  } else if (event.data.type === "eval-string") {
    // Received a request to evaluate a string of code and return the result
    const { code, id } = event.data;
    const result = eval(code);
    _postMessage({ type: "eval-result", jsonString: JSON.stringify(result), id } as MessageFromWorker);
  } else if (event.data.type === "worker-message") {
    // Received an arbitrary message from the client to be passed to userland code
    const msg = JSON.parse(event.data.jsonString);
    const ev = new MessageEvent("message", { data: msg });
    for (const listener of messageListeners) {
      listener(ev);
    }
  } else if (event.data.type === "request-initial-dom") {
    // Received a request to send the initial dom state to the client
    sendBodyInnerHTML();
  }
});
