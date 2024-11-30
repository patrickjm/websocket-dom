import _Worker from "web-worker";
import { EventEmitter } from "node:events";
import type { SerializedEvent } from "../event";
import { type DomEmitter } from "./mutations";
import { type MessageFromWorker, type MessageToWorker } from "./utils";
import { randomUUID } from "crypto";
import type { WebsocketDOMLogger } from "index";

// Hack to get around some esm issue running the lib in playwright tests
// @ts-expect-error
let Worker: typeof _Worker = _Worker.default ?? _Worker;

/**
 * Returns functions and an emitter meant to encapsulate the jsdom worker
 */
export function createDom(doc: string, { url, logger }: { url: string, logger?: WebsocketDOMLogger }) {
  const emitter = new EventEmitter() as DomEmitter;
  console.log("worker", Worker)
  const worker = new Worker(new URL("./worker-entrypoint.js", import.meta.url).toString());

  worker.postMessage({ type: "init-dom", doc, url } as MessageToWorker);

  function dispatchEvent(event: SerializedEvent) {
    worker.postMessage({ type: "client-event", event } as MessageToWorker);
  }

  worker.onmessage = (_event) => {
    const event = _event.data as MessageFromWorker;
    if (event.type === "mutation") {
      emitter.emit("mutation", event.mutation);
    } else if (event.type === "eval-result") {
      emitter.emit("evalResult", { id: event.id, jsonString: event.jsonString });
    } else if (event.type === "worker-message") {
      emitter.emit("workerMessage", JSON.parse(event.jsonString));
    } else if (event.type === "client-log") {
      emitter.emit("clientLog", event.level, event.jsonStrings);
    }
  };

  function domImport(url: string) {
    worker.postMessage({ type: "dom-import", url } as MessageToWorker);
  }

  function terminate() {
    worker.terminate();
  }

  function postWorkerMessage(message: unknown) {
    worker.postMessage({ type: "worker-message", jsonString: JSON.stringify(message) } as MessageToWorker);
  }

  async function evalString(code: string): Promise<unknown> {
    const id = randomUUID();
    worker.postMessage({ type: "eval-string", code, id } as MessageToWorker);
    return new Promise((resolve) => {
      function listener(result: { id: string, jsonString: string }) {
        if (result.id === id) {
          emitter.removeListener("evalResult", listener);
          resolve(JSON.parse(result.jsonString));
        }
      }
      emitter.addListener("evalResult", listener);
    });
  }

  function requestInitialDom() {
    worker.postMessage({ type: "request-initial-dom" } as MessageToWorker);
  }

  return {
    emitter,
    dispatchEvent,
    domImport,
    terminate,
    evalString,
    postWorkerMessage,
    requestInitialDom,
  }
}