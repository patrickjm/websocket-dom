import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import { dispatchEvent as _dispatchEvent } from "./events";
import { NodeStash } from "./nodes";
import { AppendChild, CreateElement, SetAttribute, CreateDocumentFragment, CreateTextNode, RemoveChild, SetProperty, type DomEmitter } from "./instructions";
import type { DOMWindow } from "jsdom";
import type { SerializedEvent } from "../client/types";

export function extendPrototypes(window: DOMWindow, nodes: NodeStash, emitter: DomEmitter) {
  const originalElementProto = window.HTMLElement.prototype;

  // Create a new prototype object that inherits from the original
  const newElementProto = Object.create(originalElementProto);

  // Add custom methods to the new prototype
  Object.assign(newElementProto, {
    setAttribute(name: string, value: string) {
      console.log('element: set attribute', name, value);
      const ret = originalElementProto.setAttribute.call(this, name, value);
      const ref = nodes.findRefFor(this as Node | Element);
      if (ref) {
        emitter.emit('instruction', SetAttribute.serialize({ ref, name, value }));
      }
      return ret;
    },
    appendChild(child: Element) {
      console.log('element: append child', child);
      const parentRef = nodes.findRefFor(this as Node | Element);
      const ret = originalElementProto.appendChild.call(this, child);
      const childRef = nodes.findRefFor(child as Node | Element);
      if (childRef && childRef.type === 'stashed-id' && parentRef) {
        emitter.emit('instruction', AppendChild.serialize({ parent: parentRef, child: childRef.id }));
      }
      return ret;
    }
  });
  Object.setPrototypeOf(window.HTMLElement, newElementProto);

  const originalDocumentProto = window.Document.prototype;
  const newDocumentProto = Object.create(originalDocumentProto);

  Object.assign(newDocumentProto, {
    createElement(tagName: string, options?: ElementCreationOptions) {
      console.log('document: create element', tagName, options);
      const element = originalDocumentProto.createElement.call(this, tagName, options);
      const ref = nodes.stash(element);
      emitter.emit('instruction', CreateElement.serialize({ tagName, refId: ref.id, is: options?.is }));
      return element;
    },
    createTextNode(data: string) {
      console.log('document: create text node', data);
      const textNode = originalDocumentProto.createTextNode.call(this, data);
      const ref = nodes.stash(textNode);
      emitter.emit('instruction', CreateTextNode.serialize({ refId: ref.id, data }));
      return textNode;
    },
    createDocumentFragment() {
      console.log('document: create document fragment');
      const fragment = originalDocumentProto.createDocumentFragment.call(this);
      const ref = nodes.stash(fragment);
      emitter.emit('instruction', CreateDocumentFragment.serialize({ refId: ref.id }));
      return fragment;
    }
  });
  Object.setPrototypeOf(window.Document, newDocumentProto);

  Object.getOwnPropertyNames(window.HTMLElement.prototype).forEach(prop => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, prop);
    console.log('property descriptor', prop);
    if (descriptor && descriptor.set) {
      const originalSetter = descriptor.set;
      Object.defineProperty(window.HTMLElement.prototype, prop, {
        ...descriptor,
        set(this: HTMLElement, value: any) {
          console.log('element: set property', prop, value);
          originalSetter.call(this, value);
          const ref = nodes.findRefFor(this);
          if (ref && !prop.startsWith('on') && typeof value !== 'function') {
            const serializedValue = typeof value === 'string' ? value : String(value);
            emitter.emit('instruction', SetProperty.serialize({ ref, name: prop, value: serializedValue }));
          }
        }
      });
    }
  });
}

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