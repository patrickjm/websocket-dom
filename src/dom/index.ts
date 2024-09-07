import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import type { SerializedEvent } from "../client/types";
import { dispatchEvent as _dispatchEvent } from "./events";
import { Nodes } from "./nodes";
import { Serialized, type DomEmitter } from "./types";
import * as elementFns from "./element";
import type { DOMWindow } from "jsdom";

export function wrapElement(window: DOMWindow, element: HTMLElement, nodes: Nodes, emitter: DomEmitter) {
  return new Proxy(element, {
    getPrototypeOf(target) {
      return element.constructor;
    },
    get(target, prop) {
      if (prop === '___target') {
        return target;
      }
      if (prop in elementFns) {
        const fn = elementFns[prop as keyof typeof elementFns];
        const ref = nodes.findRefFor(target);
        if (!ref) {
          return fn;
        }
        // @ts-ignore
        return (...args: any[]) => fn({ element: target, nodes, ref, emitter }, ...args);
      }
      const value = Reflect.get(target, prop);
      if (value instanceof window.HTMLElement) {
        return wrapElement(window, value, nodes, emitter);
      }
      return value;
    },
    set(target, prop, value) {
      // @ts-ignore
      target[prop] = value;
      const ref = nodes.findRefFor(target);
      if (!ref || typeof prop !== 'string') {
        return true;
      } 
      emitter.emit('instruction', Serialized.setProperty(ref, prop, value));
      return true;
    }
  });
}

function wrapDocument(window: DOMWindow, document: Document, nodes: Nodes, emitter: DomEmitter) {
  return new Proxy(document, {
    getPrototypeOf(target) {
      return target.constructor;
    },

    get(target, prop) {
      const value = target[prop as keyof Document];
      if (prop === 'createElement') {
        return (...args: Parameters<typeof document.createElement>) => {
          const element = (value as Function).bind(window.document)(...args);
          const ref = nodes.stash(element);
          emitter.emit('instruction', Serialized.createElement(element.tagName, ref.id, args[1]?.is));
          return wrapElement(window, element, nodes, emitter);
        }
      } else if (value instanceof window.HTMLElement) {
        return wrapElement(window, value, nodes, emitter);
      }
      return value;
    }
  });
}

function wrapWindow(window: DOMWindow, nodes: Nodes, emitter: DomEmitter) {
  return new Proxy(window, {
    getPrototypeOf(target) {
      return target.constructor;
    },
    get(target, prop) {
      if (prop === 'document') {
        return wrapDocument(target, target.document, nodes, emitter);
      }
      // @ts-ignore
      return target[prop];
    }
  });
}

export function createDom(doc: string, { url }: { url: string }) {
  let nodes: Nodes;
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
        // const originalCreateElement = window.document.createElement;
        // window.document.createElement = 
        nodes = new Nodes(window);
      },
    }
  );
  const window = wrapWindow(dom.window, nodes!, emitter);
  const document = window.document;

  function dispatchEvent(event: SerializedEvent) {
    _dispatchEvent(nodes, emitter, window, event);
  }

  return {
    emitter,
    window,
    dispatchEvent
  }
}