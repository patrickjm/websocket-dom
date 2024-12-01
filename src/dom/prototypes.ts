import type { DOMWindow } from "jsdom";
import { AppendChild, CloneNode, CreateDocumentFragment, CreateElement, CreateTextNode, InsertAdjacentElement, InsertAdjacentHTML, InsertAdjacentText, Normalize, PrependChild, RemoveChild, SetAttribute, SetProperty, RemoveElement, type DomEmitter } from "./mutations";
import { NodeStash } from "./nodes";

export function extendPrototypes(window: DOMWindow, nodes: NodeStash, emitter: DomEmitter) {
  
  const originalAppendChild = window.Node.prototype.appendChild;
  window.Node.prototype.appendChild = function<T extends Node>(child: T): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalAppendChild.call(this, child);
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === 'stashed-id' && parentRef) {
      emitter.emit('mutation', AppendChild.serialize({ parent: parentRef, child: childRef.id }));
      nodes.unstash(childRef);
    }
    return ret as T;
  };

  const originalRemoveChild = window.Node.prototype.removeChild;
  window.Node.prototype.removeChild = function<T extends Node>(child: T): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalRemoveChild.call(this, child);
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === 'stashed-id' && parentRef) {
      emitter.emit('mutation', RemoveChild.serialize({ parentRef, childRef }));
    }
    return ret as T;
  };


  const originalCloneNode = window.Node.prototype.cloneNode;
  window.Node.prototype.cloneNode = function(deep: boolean) {
    const ret = originalCloneNode.call(this, deep);
    const ref = nodes.stash(ret);
    emitter.emit('mutation', CloneNode.serialize({ ref, cloneId: ref.id, deep }));
    return ret;
  };

  const originalRemoveElement = window.Element.prototype.remove;
  window.Element.prototype.remove = function() {
    originalRemoveElement.call(this);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('mutation', RemoveElement.serialize({ ref }));
    }
  };

  const originalInsertAdjacentElement = window.Element.prototype.insertAdjacentElement;
  window.Element.prototype.insertAdjacentElement = function(where: InsertPosition, element: Element): Element | null {
    const ret = originalInsertAdjacentElement.call(this, where, element);
    const ref = nodes.findRefFor(this as Node | Element);
    const elementRef = nodes.findRefFor(element);
    if (ref && elementRef && elementRef.type === 'stashed-id') {
      emitter.emit('mutation', InsertAdjacentElement.serialize({ ref, where, element: elementRef.id }));
      nodes.unstash(elementRef);
    }
    return ret;
  };

  const originalInsertAdjacentHTML = window.Element.prototype.insertAdjacentHTML;
  window.Element.prototype.insertAdjacentHTML = function(where: InsertPosition, html: string): void {
    originalInsertAdjacentHTML.call(this, where, html);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('mutation', InsertAdjacentHTML.serialize({ ref, where, html }));
    }
  };

  const originalInsertAdjacentText = window.Element.prototype.insertAdjacentText;
  window.Element.prototype.insertAdjacentText = function(where: InsertPosition, text: string): void {
    originalInsertAdjacentText.call(this, where, text);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('mutation', InsertAdjacentText.serialize({ ref, where, text }));
    }
  };

  const originalNormalize = window.Node.prototype.normalize;
  window.Node.prototype.normalize = function(): void {
    originalNormalize.call(this);
    const ref = nodes.findRefFor(this as Node);
    if (ref) {
      emitter.emit('mutation', Normalize.serialize({ ref }));
    }
  };

  const originalPrepend = window.Element.prototype.prepend;
  window.Element.prototype.prepend = function(...args: (Node | string)[]): void {
    originalPrepend.apply(this, args);
    const parentRef = nodes.findRefFor(this as Node | Element);
    if (parentRef) {
      args.forEach((node) => {
        if (node instanceof Node) {
          const childRef = nodes.findRefFor(node as Node | Element);
          if (childRef && childRef.type === 'stashed-id') {
            emitter.emit('mutation', PrependChild.serialize({ parent: parentRef, child: childRef.id }));
            nodes.unstash(childRef);
          }
        } else if (typeof node === 'string') {
          emitter.emit('mutation', PrependChild.serialize({ parent: parentRef, child: node }));
        }
      });
    }
  };

  const originalSetAttribute = window.Element.prototype.setAttribute;
  window.Element.prototype.setAttribute = function(name: string, value: string) {
    const ret = originalSetAttribute.call(this, name, value);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('mutation', SetAttribute.serialize({ ref, name, value }));
    }
    return ret;
  };

  // Override innerHTML getter/setter 
  const originalInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
  if (originalInnerHTMLDescriptor) {
    Object.defineProperty(window.Element.prototype, 'innerHTML', {
      get: function() {
        return originalInnerHTMLDescriptor.get?.call(this);
      },
      set: function(value: string) {
        originalInnerHTMLDescriptor.set?.call(this, value);
        const ref = nodes.findRefFor(this as Node | Element);
        if (ref) {
          emitter.emit('mutation', SetProperty.serialize({ ref, name: 'innerHTML', value }));
        }
      },
      configurable: true,
      enumerable: true
    });
  }

  // Extend Document prototype
  const originalCreateElement = window.Document.prototype.createElement;
  window.Document.prototype.createElement = function(tagName: string, options?: ElementCreationOptions): HTMLElement {
    const element = originalCreateElement.call(this, tagName, options);
    const ref = nodes.stash(element);
    emitter.emit('mutation', CreateElement.serialize({ tagName, refId: ref.id, is: options?.is }));
    return element;
  };

  const originalCreateTextNode = window.Document.prototype.createTextNode;
  window.Document.prototype.createTextNode = function(data: string): Text {
    const textNode = originalCreateTextNode.call(this, data);
    const ref = nodes.stash(textNode);
    emitter.emit('mutation', CreateTextNode.serialize({ refId: ref.id, data }));
    return textNode;
  };

  const originalCreateDocumentFragment = window.Document.prototype.createDocumentFragment;
  window.Document.prototype.createDocumentFragment = function(): DocumentFragment {
    const fragment = originalCreateDocumentFragment.call(this);
    const ref = nodes.stash(fragment);
    emitter.emit('mutation', CreateDocumentFragment.serialize({ refId: ref.id }));
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
              emitter.emit('mutation', SetProperty.serialize({ ref, name: prop, value: serializedValue }));
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
            this[prefix + prop] = value;
            const ref = nodes.findRefFor(this);
            if (ref && !prop.startsWith('on') && typeof value !== 'function') {
              const serializedValue = typeof value === 'string' ? value : String(value);
              emitter.emit('mutation', SetProperty.serialize({ ref, name: prop, value: serializedValue }));
            }
          },
          configurable: true,
          enumerable: true
        });
      }
    });
  }

  extendPrototypeProperties(window.Node.prototype, nodes, emitter);
  extendPrototypeProperties(window.Element.prototype, nodes, emitter);
  extendPrototypeProperties(window.Text.prototype, nodes, emitter);
  extendPrototypeProperties(window.DocumentFragment.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLInputElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLTextAreaElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLButtonElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLAnchorElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLImageElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLFormElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLSelectElement.prototype, nodes, emitter);


  // Custom implementations (must come after all other prototypes are extended)
  // Override innerText getter/setter
  Object.defineProperty(window.Element.prototype, 'innerText', {
    get: function() {
      // Recursively get text content of element and descendants
      let text = '';
      const walk = (node: Node) => {
        if (node.nodeType === node.TEXT_NODE) {
          text += (node as Text).data;
        } else if (node.nodeType === node.ELEMENT_NODE) {
          const style = window.getComputedStyle(node as Element);
          if (style.display !== 'none') {
            for (const child of node.childNodes) {
              walk(child);
            }
            // Add newlines for block elements
            if (style.display === 'block' || style.display === 'list-item') {
              text += '\n';
            }
          }
        }
      };
      walk(this);
      return text.trim();
    },
    set: function(value: string) {
      // Remove all child nodes
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
      // Create and append a single text node
      if (value !== '') {
        this.appendChild(this.ownerDocument.createTextNode(value));
      }
      const ref = nodes.findRefFor(this as Node | Element);
      if (ref) {
        emitter.emit('mutation', SetProperty.serialize({ ref, name: 'innerText', value }));
      }
    },
    configurable: true,
    enumerable: true
  });
  // Override textContent getter/setter
  // Object.defineProperty(window.Node.prototype, 'textContent', {
  //   get: function() {
  //     // Get text content of all descendant text nodes
  //     let text = '';
  //     const walk = (node: Node) => {
  //       if (node.nodeType === node.TEXT_NODE) {
  //         text += (node as Text).data;
  //       }
  //       for (const child of node.childNodes) {
  //         walk(child);
  //       }
  //     };
  //     walk(this);
  //     return text;
  //   },
  //   set: function(value: string) {
  //     // Remove all child nodes
  //     while (this.firstChild) {
  //       this.removeChild(this.firstChild);
  //     }
  //     // Create and append a single text node
  //     if (value !== '') {
  //       this.appendChild(this.ownerDocument.createTextNode(value));
  //     }
  //     const ref = nodes.findRefFor(this as Node | Element);
  //     if (ref) {
  //       emitter.emit('mutation', SetProperty.serialize({ ref, name: 'textContent', value }));
  //     }
  //   },
  //   configurable: true,
  //   enumerable: true
  // });
}