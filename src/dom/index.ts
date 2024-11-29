import { EventEmitter } from "events";
import Worker from "web-worker";
import type { SerializedEvent } from "../client/types";
import { type DomEmitter } from "./instructions";
import { type MessageFromWorker, type MessageToWorker } from "./utils";
import { randomUUID } from "crypto";

export function createDom(doc: string, { url }: { url: string }) {
  const emitter = new EventEmitter() as DomEmitter;
  const worker = new Worker(new URL("./worker.js", import.meta.url).toString());

  worker.postMessage({ type: "init-dom", doc, url } as MessageToWorker);

  function dispatchEvent(event: SerializedEvent) {
    worker.postMessage({ type: "client-event", event } as MessageToWorker);
  }

  worker.onmessage = (_event) => {
    const event = _event.data as MessageFromWorker;
    if (event.type === "instruction") {
      emitter.emit("instruction", event.instruction);
    } else if (event.type === "eval-result") {
      emitter.emit("evalResult", { id: event.id, jsonString: event.jsonString });
    }
  };

  function domImport(url: string) {
    worker.postMessage({ type: "dom-import", url } as MessageToWorker);
  }

  function terminate() {
    worker.terminate();
  }

  async function evalString(code: string): Promise<any> {
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

  return {
    emitter,
    dispatchEvent,
    domImport,
    terminate,
    evalString,
    worker
  }
}