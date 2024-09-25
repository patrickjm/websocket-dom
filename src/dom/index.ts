import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import { dispatchEvent as _dispatchEvent } from "./events";
import { NodeStash } from "./nodes";
import { AppendChild, CreateElement, SetAttribute, CreateDocumentFragment, CreateTextNode, RemoveChild, SetProperty, type DomEmitter } from "./instructions";
import type { DOMWindow } from "jsdom";
import type { SerializedEvent } from "../client/types";

export function extendPrototypes(window: DOMWindow, nodes: NodeStash, emitter: DomEmitter) {
  // Extend HTMLElement prototype
  const originalSetAttribute = window.HTMLElement.prototype.setAttribute;
  window.HTMLElement.prototype.setAttribute = function(name: string, value: string) {
    const ret = originalSetAttribute.call(this, name, value);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('instruction', SetAttribute.serialize({ ref, name, value }));
    }
    return ret;
  };

  const originalAppendChild = window.HTMLElement.prototype.appendChild;
  window.HTMLElement.prototype.appendChild = function<T extends Node>(child: T): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalAppendChild.call(this, child);
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === 'stashed-id' && parentRef) {
      emitter.emit('instruction', AppendChild.serialize({ parent: parentRef, child: childRef.id }));
    }
    return ret as T;
  };

  // Extend Document prototype
  const originalCreateElement = window.Document.prototype.createElement;
  window.Document.prototype.createElement = function(tagName: string, options?: ElementCreationOptions): HTMLElement {
    const element = originalCreateElement.call(this, tagName, options);
    const ref = nodes.stash(element);
    emitter.emit('instruction', CreateElement.serialize({ tagName, refId: ref.id, is: options?.is }));
    return element;
  };

  const originalCreateTextNode = window.Document.prototype.createTextNode;
  window.Document.prototype.createTextNode = function(data: string): Text {
    const textNode = originalCreateTextNode.call(this, data);
    const ref = nodes.stash(textNode);
    emitter.emit('instruction', CreateTextNode.serialize({ refId: ref.id, data }));
    return textNode;
  };

  const originalCreateDocumentFragment = window.Document.prototype.createDocumentFragment;
  window.Document.prototype.createDocumentFragment = function(): DocumentFragment {
    const fragment = originalCreateDocumentFragment.call(this);
    const ref = nodes.stash(fragment);
    emitter.emit('instruction', CreateDocumentFragment.serialize({ refId: ref.id }));
    return fragment;
  };

  // Override normal properties
  function extendPrototypeProperties(prototype: any, nodes: NodeStash, emitter: DomEmitter) {
    Object.getOwnPropertyNames(prototype).forEach(prop => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
      if (descriptor && descriptor.set) {
        const originalSetter = descriptor.set;
        Object.defineProperty(prototype, prop, {
          ...descriptor,
          set(this: Element, value: any) {
            originalSetter.call(this, value);
            const ref = nodes.findRefFor(this);
            if (ref && !prop.startsWith('on') && typeof value !== 'function') {
              const serializedValue = typeof value === 'string' ? value : String(value);
              emitter.emit('instruction', SetProperty.serialize({ ref, name: prop, value: serializedValue }));
            }
          }
        });
      } else if (descriptor && descriptor.writable) {
        // Add handling for regular writable properties
        const originalValue = descriptor.value;
        const prefix = '___';
        Object.defineProperty(prototype, prop, {
          get() {
            return this[prefix + prop] || originalValue;
          },
          set(value: any) {
            console.log('element: set property', prop, value);
            this[prefix + prop] = value;
            const ref = nodes.findRefFor(this);
            if (ref && !prop.startsWith('on') && typeof value !== 'function') {
              const serializedValue = typeof value === 'string' ? value : String(value);
              emitter.emit('instruction', SetProperty.serialize({ ref, name: prop, value: serializedValue }));
            }
          },
          configurable: true,
          enumerable: true
        });
      }
    });
  }

  extendPrototypeProperties(window.HTMLElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.Element.prototype, nodes, emitter);
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