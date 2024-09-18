import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import { dispatchEvent as _dispatchEvent } from "./events";
import { Nodes } from "./nodes";
import { Serialized, type DomEmitter } from "./types";
import type { DOMWindow } from "jsdom";
import type { SerializedEvent } from "../client/types";

export function extendPrototypes(window: DOMWindow, nodes: Nodes, emitter: DomEmitter) {
  const originalElementProto = Object.getPrototypeOf(window.HTMLElement.prototype);
  const originalDocumentProto = Object.getPrototypeOf(window.Document.prototype);

  // Extend HTMLElement prototype
  Object.setPrototypeOf(window.HTMLElement.prototype, {
    ...originalElementProto,
    setAttribute(name: string, value: string) {
      const ret = originalElementProto.setAttribute.call(this, name, value);
      const ref = nodes.findRefFor(this as Node | Element);
      if (ref) {
        emitter.emit('instruction', Serialized.setAttribute(ref, name, value));
      }
      return ret;
    },
    appendChild(child: Element) {
      const ref = nodes.findRefFor(this as Node | Element);
      const ret = originalElementProto.appendChild.call(this, child);
      const childRef = nodes.findRefFor(child as Node | Element);
      if (childRef && ref) {
        emitter.emit('instruction', Serialized.appendChild(ref, childRef));
      }
      return ret;
    },
  });

  // Extend Document prototype
  Object.setPrototypeOf(window.Document.prototype, {
    ...originalDocumentProto,
    createElement(tagName: string, options?: ElementCreationOptions) {
      const element = originalDocumentProto.createElement.call(this, tagName, options);
      const ref = nodes.stash(element);
      emitter.emit('instruction', Serialized.createElement(element.tagName, ref.id, options?.is));
      return element;
    },
  });

  // Extend HTMLElement prototype for property setters
  const disallowedProperties: string[] = [];
  for (const prop in window.HTMLElement.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, prop);
    if (descriptor && descriptor.set && !disallowedProperties.includes(prop)) {
      const originalSetter = descriptor.set;
      Object.defineProperty(window.HTMLElement.prototype, prop, {
        ...descriptor,
        set(this: HTMLElement, value: any) {
          originalSetter.call(this, value);
          const ref = nodes.findRefFor(this);
          if (ref) {
            const serializedValue = typeof value === 'string' ? value : String(value);
            emitter.emit('instruction', Serialized.setProperty(ref, prop, serializedValue));
          }
        }
      });
    }
  }
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
        nodes = new Nodes(window);
        extendPrototypes(window, nodes, emitter);
      },
    }
  );

  const { window } = dom;
  const { document } = window;

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