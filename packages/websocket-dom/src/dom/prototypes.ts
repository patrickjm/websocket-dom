import type { DOMWindow } from "jsdom";
import { AppendChild, CloneNode, CreateDocumentFragment, CreateElement, CreateTextNode, InsertAdjacentElement, InsertAdjacentHTML, InsertAdjacentText, InsertBefore, Normalize, PrependChild, RemoveAttribute, RemoveChild, ReplaceChild, SetAttribute, SetProperty, type DomEmitter } from "./instructions";
import { NodeStash } from "./nodes";
import { hasUnsafeHtml, isScriptElement, shouldSkipAttribute } from "./sanitize";
import { isTargetSuppressed } from "./suppress";

export function extendPrototypes(window: DOMWindow, nodes: NodeStash, emitter: DomEmitter) {
  const suppressedNodes = new WeakSet<Node>();
  const blockedPropertyNames = new Set(['innerHTML', 'outerHTML']);

  const isExecutableElement = (node: Node | null): boolean => {
    if (!node || !(node instanceof window.Element)) {
      return false;
    }
    return isScriptElement(node);
  };

  const isSuppressedNode = (node: Node | null): boolean => {
    if (!node) {
      return false;
    }
    return suppressedNodes.has(node) || isExecutableElement(node);
  };

  const shouldSkipElementAttribute = (element: Element, name: string, value: string): boolean => {
    if (isExecutableElement(element)) {
      return true;
    }
    return shouldSkipAttribute(name, value);
  };
  
  const originalAppendChild = window.Node.prototype.appendChild;
  window.Node.prototype.appendChild = function<T extends Node>(child: T): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalAppendChild.call(this, child);
    if (isSuppressedNode(child)) {
      return ret as T;
    }
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === 'stashed-id' && parentRef) {
      emitter.emit('instruction', AppendChild.serialize({ parent: parentRef, child: childRef.id }));
    }
    return ret as T;
  };

  const originalInsertBefore = window.Node.prototype.insertBefore;
  window.Node.prototype.insertBefore = function<T extends Node>(newChild: T, referenceChild: Node | null): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const newChildRef = nodes.findRefFor(newChild as Node | Element);
    const referenceRef = referenceChild ? nodes.findRefFor(referenceChild as Node | Element) : null;
    const ret = originalInsertBefore.call(this, newChild, referenceChild);
    if (isSuppressedNode(newChild)) {
      return ret as T;
    }
    if (parentRef && newChildRef && newChildRef.type === 'stashed-id' && (referenceChild === null || referenceRef)) {
      emitter.emit('instruction', InsertBefore.serialize({
        parent: parentRef,
        child: newChildRef.id,
        referenceChild: referenceRef ?? null,
      }));
    }
    return ret as T;
  };

  const originalReplaceChild = window.Node.prototype.replaceChild;
  window.Node.prototype.replaceChild = function<T extends Node>(newChild: Node, oldChild: T): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const newChildRef = nodes.findRefFor(newChild as Node | Element);
    const oldChildRef = nodes.findRefFor(oldChild as Node | Element);
    const ret = originalReplaceChild.call(this, newChild, oldChild);
    if (isSuppressedNode(newChild)) {
      return ret as T;
    }
    if (parentRef && newChildRef && newChildRef.type === 'stashed-id' && oldChildRef) {
      emitter.emit('instruction', ReplaceChild.serialize({
        parent: parentRef,
        newChild: newChildRef.id,
        oldChild: oldChildRef,
      }));
    }
    return ret as T;
  };

  const originalRemoveChild = window.Node.prototype.removeChild;
  window.Node.prototype.removeChild = function<T extends Node>(child: T): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalRemoveChild.call(this, child);
    if (isSuppressedNode(child)) {
      return ret as T;
    }
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === 'stashed-id' && parentRef) {
      emitter.emit('instruction', RemoveChild.serialize({ parentRef, childRef }));
    }
    return ret as T;
  };


  const originalCloneNode = window.Node.prototype.cloneNode;
  window.Node.prototype.cloneNode = function(deep: boolean) {
    const ret = originalCloneNode.call(this, deep);
    const ref = nodes.stash(ret);
    emitter.emit('instruction', CloneNode.serialize({ ref, cloneId: ref.id, deep }));
    return ret;
  };

  const originalInsertAdjacentElement = window.Element.prototype.insertAdjacentElement;
  window.Element.prototype.insertAdjacentElement = function(where: InsertPosition, element: Element): Element | null {
    const ret = originalInsertAdjacentElement.call(this, where, element);
    if (isSuppressedNode(element)) {
      return ret;
    }
    const ref = nodes.findRefFor(this as Node | Element);
    const elementRef = nodes.findRefFor(element);
    if (ref && elementRef && elementRef.type === 'stashed-id') {
      emitter.emit('instruction', InsertAdjacentElement.serialize({ ref, where, element: elementRef.id }));
    }
    return ret;
  };

  const originalInsertAdjacentHTML = window.Element.prototype.insertAdjacentHTML;
  window.Element.prototype.insertAdjacentHTML = function(where: InsertPosition, html: string): void {
    originalInsertAdjacentHTML.call(this, where, html);
    if (hasUnsafeHtml(html)) {
      return;
    }
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('instruction', InsertAdjacentHTML.serialize({ ref, where, html }));
    }
  };

  const originalInsertAdjacentText = window.Element.prototype.insertAdjacentText;
  window.Element.prototype.insertAdjacentText = function(where: InsertPosition, text: string): void {
    originalInsertAdjacentText.call(this, where, text);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit('instruction', InsertAdjacentText.serialize({ ref, where, text }));
    }
  };

  const originalNormalize = window.Node.prototype.normalize;
  window.Node.prototype.normalize = function(): void {
    originalNormalize.call(this);
    const ref = nodes.findRefFor(this as Node);
    if (ref) {
      emitter.emit('instruction', Normalize.serialize({ ref }));
    }
  };

  const originalPrepend = window.Element.prototype.prepend;
  window.Element.prototype.prepend = function(...args: (Node | string)[]): void {
    originalPrepend.apply(this, args);
    const parentRef = nodes.findRefFor(this as Node | Element);
    if (parentRef) {
      args.forEach((node) => {
        if (node instanceof Node) {
          if (isSuppressedNode(node)) {
            return;
          }
          const childRef = nodes.findRefFor(node as Node | Element);
          if (childRef && childRef.type === 'stashed-id') {
            emitter.emit('instruction', PrependChild.serialize({ parent: parentRef, child: childRef.id }));
          }
        } else if (typeof node === 'string') {
          emitter.emit('instruction', PrependChild.serialize({ parent: parentRef, child: node }));
        }
      });
    }
  };

  const classAttributeSuppressed = new WeakSet<Element>();
  const styleAttributeSuppressed = new WeakSet<Element>();

  const originalSetAttribute = window.Element.prototype.setAttribute;
  window.Element.prototype.setAttribute = function(name: string, value: string) {
    const ret = originalSetAttribute.call(this, name, value);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      if (shouldSkipElementAttribute(this, name, value)) {
        return ret;
      }
      if (name === 'class' && classAttributeSuppressed.has(this)) {
        return ret;
      }
      if (name === 'style' && styleAttributeSuppressed.has(this)) {
        return ret;
      }
      emitter.emit('instruction', SetAttribute.serialize({ ref, name, value }));
    }
    return ret;
  };

  const originalRemoveAttribute = window.Element.prototype.removeAttribute;
  window.Element.prototype.removeAttribute = function(name: string) {
    const ret = originalRemoveAttribute.call(this, name);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      const lowerName = name.toLowerCase();
      if (lowerName.startsWith('on') || lowerName === 'srcdoc') {
        return ret;
      }
      if (name === 'class' && classAttributeSuppressed.has(this)) {
        return ret;
      }
      if (name === 'style' && styleAttributeSuppressed.has(this)) {
        return ret;
      }
      emitter.emit('instruction', RemoveAttribute.serialize({ ref, name }));
    }
    return ret;
  };

  // Extend Document prototype
  const originalCreateElement = window.Document.prototype.createElement;
  window.Document.prototype.createElement = function(tagName: string, options?: ElementCreationOptions): HTMLElement {
    const element = originalCreateElement.call(this, tagName, options);
    if (tagName.toLowerCase() === 'script') {
      suppressedNodes.add(element);
      return element;
    }
    const ref = nodes.stash(element);
    emitter.emit('instruction', CreateElement.serialize({ tagName, refId: ref.id, is: options?.is }));
    return element;
  };

  const originalCreateTextNode = window.Document.prototype.createTextNode;
  window.Document.prototype.createTextNode = function(data: string): Text {
    console.log('document: create text node', data);
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
              if (blockedPropertyNames.has(prop)) {
                return;
              }
              if (isTargetSuppressed(this)) {
                const element = this as HTMLElement;
                const isEditable = element.isContentEditable || element.getAttribute('contenteditable') !== null;
                if (prop === 'value' || (prop === 'textContent' && isEditable)) {
                  return;
                }
              }
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
            this[prefix + prop] = value;
            const ref = nodes.findRefFor(this);
            if (ref && !prop.startsWith('on') && typeof value !== 'function') {
              if (blockedPropertyNames.has(prop)) {
                return;
              }
              if (isTargetSuppressed(this)) {
                const element = this as HTMLElement;
                const isEditable = element.isContentEditable || element.getAttribute('contenteditable') !== null;
                if (prop === 'value' || (prop === 'textContent' && isEditable)) {
                  return;
                }
              }
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

  extendPrototypeProperties(window.Node.prototype, nodes, emitter);
  extendPrototypeProperties(window.Element.prototype, nodes, emitter);
  extendPrototypeProperties(window.Text.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLInputElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLTextAreaElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLButtonElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLAnchorElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLImageElement.prototype, nodes, emitter);
  extendPrototypeProperties(window.HTMLFormElement.prototype, nodes, emitter);

  const tokenListElements = new WeakMap<DOMTokenList, Element>();
  const styleElements = new WeakMap<CSSStyleDeclaration, Element>();

  const classListDescriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, 'classList');
  if (classListDescriptor?.get) {
    Object.defineProperty(window.Element.prototype, 'classList', {
      ...classListDescriptor,
      get(this: Element) {
        const list = classListDescriptor.get?.call(this) as DOMTokenList;
        if (list) {
          tokenListElements.set(list, this);
        }
        return list;
      },
    });
  }

  const stylePropertyDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'style');
  if (stylePropertyDescriptor?.get) {
    Object.defineProperty(window.HTMLElement.prototype, 'style', {
      ...stylePropertyDescriptor,
      get(this: HTMLElement) {
        const style = stylePropertyDescriptor.get?.call(this) as CSSStyleDeclaration;
        if (style) {
          styleElements.set(style, this);
        }
        return style;
      },
    });
  }

  type DomTokenListWithElement = DOMTokenList & { _element?: Element; ownerElement?: Element };
  const getTokenListElement = (list: DOMTokenList): Element | null => {
    const mapped = tokenListElements.get(list);
    if (mapped) {
      return mapped;
    }
    const maybe = list as DomTokenListWithElement;
    if (maybe._element instanceof Element) {
      return maybe._element;
    }
    if (maybe.ownerElement instanceof Element) {
      return maybe.ownerElement;
    }
    return null;
  };

  const emitClassAttribute = (element: Element): void => {
    const ref = nodes.findRefFor(element);
    if (!ref) {
      return;
    }
    const value = element.getAttribute('class');
    if (value === null || value === '') {
      emitter.emit('instruction', RemoveAttribute.serialize({ ref, name: 'class' }));
    } else {
      emitter.emit('instruction', SetAttribute.serialize({ ref, name: 'class', value }));
    }
  };

  const originalTokenListAdd = window.DOMTokenList.prototype.add;
  window.DOMTokenList.prototype.add = function(...tokens: string[]): void {
    const element = getTokenListElement(this);
    if (element && element.classList === this) {
      classAttributeSuppressed.add(element);
      originalTokenListAdd.apply(this, tokens);
      classAttributeSuppressed.delete(element);
      emitClassAttribute(element);
    } else {
      originalTokenListAdd.apply(this, tokens);
    }
  };

  const originalTokenListRemove = window.DOMTokenList.prototype.remove;
  window.DOMTokenList.prototype.remove = function(...tokens: string[]): void {
    const element = getTokenListElement(this);
    if (element && element.classList === this) {
      classAttributeSuppressed.add(element);
      originalTokenListRemove.apply(this, tokens);
      classAttributeSuppressed.delete(element);
      emitClassAttribute(element);
    } else {
      originalTokenListRemove.apply(this, tokens);
    }
  };

  const originalTokenListToggle = window.DOMTokenList.prototype.toggle;
  window.DOMTokenList.prototype.toggle = function(token: string, force?: boolean): boolean {
    const element = getTokenListElement(this);
    if (element && element.classList === this) {
      classAttributeSuppressed.add(element);
      const result = originalTokenListToggle.call(this, token, force);
      classAttributeSuppressed.delete(element);
      emitClassAttribute(element);
      return result;
    }
    return originalTokenListToggle.call(this, token, force);
  };

  const originalTokenListReplace = window.DOMTokenList.prototype.replace;
  if (typeof originalTokenListReplace === 'function') {
    window.DOMTokenList.prototype.replace = function(token: string, newToken: string): boolean {
      const element = getTokenListElement(this);
      if (element && element.classList === this) {
        classAttributeSuppressed.add(element);
        const result = originalTokenListReplace.call(this, token, newToken);
        classAttributeSuppressed.delete(element);
        emitClassAttribute(element);
        return result;
      }
      return originalTokenListReplace.call(this, token, newToken);
    };
  }

  type StyleDeclarationWithElement = CSSStyleDeclaration & { _element?: Element; ownerElement?: Element };
  const getStyleElement = (style: CSSStyleDeclaration): Element | null => {
    const mapped = styleElements.get(style);
    if (mapped) {
      return mapped;
    }
    const maybe = style as StyleDeclarationWithElement;
    if (maybe._element instanceof Element) {
      return maybe._element;
    }
    if (maybe.ownerElement instanceof Element) {
      return maybe.ownerElement;
    }
    return null;
  };

  const emitStyleAttribute = (element: Element): void => {
    const ref = nodes.findRefFor(element);
    if (!ref) {
      return;
    }
    const value = element.getAttribute('style');
    if (value === null || value === '') {
      emitter.emit('instruction', RemoveAttribute.serialize({ ref, name: 'style' }));
    } else {
      emitter.emit('instruction', SetAttribute.serialize({ ref, name: 'style', value }));
    }
  };

  const originalStyleSetProperty = window.CSSStyleDeclaration.prototype.setProperty;
  window.CSSStyleDeclaration.prototype.setProperty = function(property: string, value: string | null, priority?: string): void {
    const element = getStyleElement(this);
    if (element && element instanceof window.HTMLElement && element.style === this) {
      styleAttributeSuppressed.add(element);
      originalStyleSetProperty.call(this, property, value, priority);
      styleAttributeSuppressed.delete(element);
      emitStyleAttribute(element);
      return;
    }
    originalStyleSetProperty.call(this, property, value, priority);
  };

  const originalStyleRemoveProperty = window.CSSStyleDeclaration.prototype.removeProperty;
  window.CSSStyleDeclaration.prototype.removeProperty = function(property: string): string {
    const element = getStyleElement(this);
    if (element && element instanceof window.HTMLElement && element.style === this) {
      styleAttributeSuppressed.add(element);
      const result = originalStyleRemoveProperty.call(this, property);
      styleAttributeSuppressed.delete(element);
      emitStyleAttribute(element);
      return result;
    }
    return originalStyleRemoveProperty.call(this, property);
  };

  const styleTextDescriptor = Object.getOwnPropertyDescriptor(window.CSSStyleDeclaration.prototype, 'cssText');
  if (styleTextDescriptor?.set) {
    Object.defineProperty(window.CSSStyleDeclaration.prototype, 'cssText', {
      ...styleTextDescriptor,
      set(this: CSSStyleDeclaration, value: string) {
        const element = getStyleElement(this);
        if (element && element instanceof window.HTMLElement && element.style === this) {
          styleAttributeSuppressed.add(element);
          styleTextDescriptor.set?.call(this, value);
          styleAttributeSuppressed.delete(element);
          emitStyleAttribute(element);
          return;
        }
        styleTextDescriptor.set?.call(this, value);
      },
    });
  }

}
