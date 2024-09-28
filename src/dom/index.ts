import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import vm, { Module } from "vm";
import type { SerializedEvent } from "../client/types";
import { dispatchEvent as _dispatchEvent } from "./events";
import { type DomEmitter } from "./instructions";
import { NodeStash } from "./nodes";
import { extendPrototypes } from "./prototypes";
import { fileURLToPath } from "url";
import path from "path";
import { readFile } from "fs/promises";

export function createDom(doc: string, { url }: { url: string }) {
  let nodes: NodeStash;
  const emitter = new EventEmitter() as DomEmitter;

  const dom = new JSDOM(
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

  const window = dom.window;
  const document = window.document;

  const createStorage = () => {
    let storage: Record<string, string> = {};
    return {
      getItem(key: string) {
        return storage[key];
      },
      setItem(key: string, value: string) {
          storage[key] = String(value);
      },
      removeItem(key: string) {
        delete storage[key];
      },
      clear() {
        storage = {};
      }
    };
  }

  const localStorage = createStorage();
  const sessionStorage = createStorage();

  const context = vm.createContext({
    window,
    document,
    console,
    localStorage,
    sessionStorage,
  });

  function dispatchEvent(event: SerializedEvent) {
    _dispatchEvent(nodes, emitter, window, event);
  }

  return {
    emitter,
    window,
    document,
    dispatchEvent
  }
}