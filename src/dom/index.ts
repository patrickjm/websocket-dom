import { EventEmitter } from "events";
import { JSDOM } from "jsdom";
import type { SerializedEvent } from "../client/types";
import { dispatchEvent as _dispatchEvent } from "./events";
import { Nodes } from "./nodes";
import { Serialized, type DomEmitter } from "./types";
import * as elementFns from "./wrappers/element";
import * as documentFns from "./wrappers/document";
import type { DOMWindow } from "jsdom";
import { isProxy } from "util/types";

interface Wrapped {
  target: any;
}
function isWrapped(target: any): target is Wrapped {
  return isProxy(target) && !!target?.___wrapped?.target;
}


export function wrap(window: DOMWindow, target: any, nodes: Nodes, emitter: DomEmitter): any {
  if (!target 
    || isWrapped(target)
    || typeof target === 'number'
    || typeof target === 'boolean'
    || typeof target === 'string'
  ) {
    return target;
  }
  // if (typeof target === 'function') {
  //   return (...args: any[]) => wrap(window, target(...args), nodes, emitter);
  // }
  if (target instanceof window.Window
    || target instanceof window.Document
    || target instanceof window.HTMLElement) {
    return new Proxy(target, {
      getPrototypeOf(target) {
        return target.constructor;
      },
      getOwnPropertyDescriptor(target, prop) {
        return Object.getOwnPropertyDescriptor(target, prop);
      },
      has(target, prop) {
        return prop in target;
      },
      ownKeys(target) {
        return Object.keys(target);
      },
      setPrototypeOf(target, v) {
        return Object.setPrototypeOf(target, v);
      },
      defineProperty(target, property, attributes) {
        Object.defineProperty(target, property, attributes);
        return true;
      },
      get(target, prop) {
        if (prop === '___wrapped') {
          return { target } as Wrapped;
        }
        if (prop === 'constructor') {
          return target.constructor;
        }
        if (prop === 'prototype') {
          return target.constructor.prototype;
        }
        if (prop in Object.prototype) {
          const protoValue = Object.prototype[prop as keyof typeof Object.prototype];
          if (typeof protoValue === 'function') {
            return protoValue.bind(target);
          }
          return protoValue;
        }
        // Custom handlers for HTMLElement
        if (target instanceof window.HTMLElement && prop in elementFns) {
          const fn = elementFns[prop as keyof typeof elementFns];
          const ref = nodes.findRefFor(target);
          if (!ref) {
            return fn;
          }
          // @ts-ignore
          return (...args: any[]) => fn({ element: target, nodes, ref, emitter }, ...args);
        }

        // Custom handlers for Document
        if (target instanceof window.Document && prop in documentFns) {
          const fn = documentFns[prop as keyof typeof documentFns];
          const ref = nodes.findRefFor(target);
          if (!ref) {
            return fn;
          }
          // @ts-ignore
          return (...args: any[]) => fn({ window, document: target, nodes, ref, emitter }, ...args);
        }

        const value = Reflect.get(target, prop);
        if (typeof value === 'function') {
          // return wrap(window, value.bind(target), nodes, emitter);
          return (...args: any[]) => {
            const ret = value.bind(target)(...args);
            return wrap(window, ret, nodes, emitter);
          }
        }
        return wrap(window, value, nodes, emitter);
      },
      set(target, prop, value) {
        if (target instanceof window.HTMLElement) {
          // @ts-ignore
          target[prop] = value;
          const ref = nodes.findRefFor(target);
          if (!ref || typeof prop !== 'string') {
            return true;
          }
          const allowedProperties = [
            'value', 'checked', 'disabled', 'readOnly',
            'hidden', 'className', 'id',
            'placeholder', 'title',
            'ariaLabel', 'ariaDescribedBy', 'ariaHidden', 'ariaExpanded',
            'style'
          ];

          if (allowedProperties.includes(prop)) {
            const serializedValue = typeof value === 'string' ? value : String(value);
            emitter.emit('instruction', Serialized.setProperty(ref, prop, serializedValue));
          }
          return true;
        } else {
          target[prop as keyof typeof target] = value;
          return true;
        }
      }
    });
  }
  if (typeof target === 'object') {
    return new Proxy(target, {
      get(target, prop) {
        if (prop === '___wrapped') {
          return { target } as Wrapped;
        }
        return wrap(window, target[prop as keyof typeof target], nodes, emitter);
      },
      construct(target, argArray, newTarget) {
        const ret = new target(...argArray);
        return wrap(window, ret, nodes, emitter);
      },
      set(target, prop, value) {
        // @ts-ignore
        target[prop] = value;
        return true;
      }
    });
  }
  return target;
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
  const window = wrap(dom.window, dom.window, nodes!, emitter);
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