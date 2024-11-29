import { JSDOM } from "jsdom";
import { NodeStash } from "./nodes";
import { extendPrototypes } from "./prototypes";
import { SetProperty, type DomEmitter } from "./instructions";
import { EventEmitter } from "events";
import { createBrowserStorage, type MessageFromWorker, type MessageToWorker } from "./utils";
import { dispatchEvent } from "./events";

let nodes: NodeStash;
let dom: JSDOM;
const emitter = new EventEmitter() as DomEmitter;
const _postMessage: (msg: MessageFromWorker) => void = globalThis.postMessage;

// @ts-expect-error
postMessage = (...args: any[]) => {
  throw new Error("websocket-dom does not support window.postMessage");
}

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

  emitter.on("instruction", (instruction) => {
    _postMessage({ type: "instruction", instruction } as MessageFromWorker);
  });
}

function sendBodyInnerHTML() {
  _postMessage({
    type: "instruction",
    instruction: SetProperty.serialize({
      ref: { type: 'xpath', xpath: '/html/body' },
      name: 'innerHTML',
      value: dom.window.document.body.innerHTML,
    })
  } as MessageFromWorker);
}


addEventListener("message", (event: MessageEvent<MessageToWorker>) => {
  if (event.data.type === "init-dom") {
    const { doc, url } = event.data;
    initDom(doc, url);
    sendBodyInnerHTML();
  } else if (event.data.type === "client-event") {
    dispatchEvent(nodes, emitter, dom.window, event.data.event);
  } else if (event.data.type === "dom-import") {
    const { url } = event.data;
    import(url)
      .catch((err) => {
        console.error(`Error importing ${url}: ${err}`);
      });
  } else if (event.data.type === "eval-string") {
    const { code, id } = event.data;
    const result = eval(code);
    _postMessage({ type: "eval-result", jsonString: JSON.stringify(result), id } as MessageFromWorker);
  }
});
