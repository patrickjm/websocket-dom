import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import { dispatchEvent as _dispatchEvent } from "./events";
import { Nodes } from "./nodes";
import { Serialized, type DomEmitter } from "./types";
import type { DOMWindow } from "jsdom";
import type { SerializedEvent } from "../client/types";

export function extendPrototypes(window: DOMWindow, nodes: Nodes, emitter: DomEmitter) {
  const originalElementProto = window.HTMLElement.prototype;

  // Create a new prototype object that inherits from the original
  const newElementProto = Object.create(originalElementProto);

  // Add custom methods to the new prototype
  Object.assign(newElementProto, {
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
  Object.setPrototypeOf(window.HTMLElement, newElementProto);

  const originalDocumentProto = window.Document.prototype;
  const newDocumentProto = Object.create(originalDocumentProto);

  Object.assign(newDocumentProto, {
    createElement(tagName: string, options?: ElementCreationOptions) {
      const element = originalDocumentProto.createElement.call(this, tagName, options);
      const ref = nodes.stash(element);
      emitter.emit('instruction', Serialized.create(element.tagName, ref.id, options?.is));
      return element;
    },
    createTextNode(data: string) {
      const textNode = originalDocumentProto.createTextNode.call(this, data);
      const ref = nodes.stash(textNode);
      emitter.emit('instruction', Serialized.createTextNode(ref.id, data));
      return textNode;
    },
    createDocumentFragment() {
      const fragment = originalDocumentProto.createDocumentFragment.call(this);
      const ref = nodes.stash(fragment);
      emitter.emit('instruction', Serialized.createDocumentFragment(ref.id));
      return fragment;
    }
  });
  Object.setPrototypeOf(window.Document, newDocumentProto);

  Object.getOwnPropertyNames(window.HTMLElement.prototype).forEach(prop => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, prop);
    if (descriptor && descriptor.set) {
      const originalSetter = descriptor.set;
      Object.defineProperty(window.HTMLElement.prototype, prop, {
        ...descriptor,
        set(this: HTMLElement, value: any) {
          originalSetter.call(this, value);
          const ref = nodes.findRefFor(this);
          if (ref && !prop.startsWith('on')) {
            const serializedValue = typeof value === 'string' ? value : String(value);
            emitter.emit('instruction', Serialized.setProperty(ref, prop, serializedValue));
          }
        }
      });
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