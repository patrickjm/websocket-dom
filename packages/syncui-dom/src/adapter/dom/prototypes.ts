import type { AdapterWindow } from "./window-types";
import {
  AppendChild,
  CloneNode,
  CreateDocumentFragment,
  CreateElement,
  CreateTextNode,
  InsertAdjacentElement,
  InsertAdjacentHTML,
  InsertAdjacentText,
  InsertBefore,
  Normalize,
  PrependChild,
  RemoveAttribute,
  RemoveChild,
  ReplaceChild,
  SetAttribute,
  SetProperty,
  type DomEmitter,
} from "syncui/core/ops/instructions";
import type { NodeRef, NodeStash } from "syncui/core/model/nodes";
import {
  hasUnsafeHtml,
  isScriptElement,
  shouldSkipAttribute,
} from "./sanitize";
import { isTargetSuppressed } from "./suppress";

export function extendPrototypes(
  window: AdapterWindow,
  nodes: NodeStash,
  emitter: DomEmitter
) {
  const ctorWindow = window as Window & typeof globalThis;
  const suppressedNodes = new WeakSet<Node>();
  const blockedPropertyNames = new Set(["innerHTML", "outerHTML"]);

  const isExecutableElement = (node: Node | null): boolean => {
    if (!(node && node instanceof ctorWindow.Element)) {
      return false;
    }
    return isScriptElement(node as Element);
  };

  const isSuppressedNode = (node: Node | null): boolean => {
    if (!node) {
      return false;
    }
    return suppressedNodes.has(node) || isExecutableElement(node);
  };

  const shouldSkipElementAttribute = (
    element: Element,
    name: string,
    value: string
  ): boolean => {
    if (isExecutableElement(element)) {
      return true;
    }
    return shouldSkipAttribute(name, value);
  };

  const shouldEmitProperty = (
    element: Element,
    prop: string,
    value: unknown
  ): boolean => {
    if (isHandlerProperty(prop, value)) {
      return false;
    }
    if (blockedPropertyNames.has(prop)) {
      return false;
    }
    return !isSuppressedProperty(element, prop);
  };

  const isHandlerProperty = (prop: string, value: unknown): boolean => {
    return prop.startsWith("on") || typeof value === "function";
  };

  const isSuppressedProperty = (element: Element, prop: string): boolean => {
    if (!isTargetSuppressed(element)) {
      return false;
    }
    if (prop === "value") {
      return true;
    }
    if (prop !== "textContent" && prop !== "innerText") {
      return false;
    }
    return isEditableElement(element);
  };

  const isEditableElement = (element: Element): boolean => {
    const htmlElement = element as HTMLElement;
    if (!(htmlElement instanceof ctorWindow.HTMLElement)) {
      return false;
    }
    return (
      htmlElement.isContentEditable ||
      htmlElement.getAttribute("contenteditable") !== null
    );
  };

  const emitProperty = (
    element: Element,
    prop: string,
    value: unknown
  ): void => {
    const ref = nodes.findRefFor(element);
    if (!ref) {
      return;
    }
    if (!shouldEmitProperty(element, prop, value)) {
      return;
    }
    const serializedValue = typeof value === "string" ? value : String(value);
    emitter.emit(
      "instruction",
      SetProperty.serialize({ ref, name: prop, value: serializedValue })
    );
  };

  const originalAppendChild = ctorWindow.Node.prototype.appendChild;
  ctorWindow.Node.prototype.appendChild = function <T extends Node>(
    child: T
  ): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalAppendChild.call(this, child);
    if (isSuppressedNode(child)) {
      return ret as T;
    }
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === "stashed-id" && parentRef) {
      emitter.emit(
        "instruction",
        AppendChild.serialize({ parent: parentRef, child: childRef.id })
      );
    }
    return ret as T;
  };

  const originalInsertBefore = ctorWindow.Node.prototype.insertBefore;
  ctorWindow.Node.prototype.insertBefore = function <T extends Node>(
    newChild: T,
    referenceChild: Node | null
  ): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const newChildRef = nodes.findRefFor(newChild as Node | Element);
    const referenceRef = referenceChild
      ? nodes.findRefFor(referenceChild as Node | Element)
      : null;
    const ret = originalInsertBefore.call(this, newChild, referenceChild);
    if (isSuppressedNode(newChild)) {
      return ret as T;
    }
    const payload = getInsertBeforePayload(
      parentRef,
      newChildRef,
      referenceChild,
      referenceRef
    );
    if (payload) {
      emitter.emit("instruction", InsertBefore.serialize(payload));
    }
    return ret as T;
  };

  const originalReplaceChild = ctorWindow.Node.prototype.replaceChild;
  ctorWindow.Node.prototype.replaceChild = function <T extends Node>(
    newChild: Node,
    oldChild: T
  ): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const newChildRef = nodes.findRefFor(newChild as Node | Element);
    const oldChildRef = nodes.findRefFor(oldChild as Node | Element);
    const ret = originalReplaceChild.call(this, newChild, oldChild);
    if (isSuppressedNode(newChild)) {
      return ret as T;
    }
    if (
      parentRef &&
      newChildRef &&
      newChildRef.type === "stashed-id" &&
      oldChildRef
    ) {
      emitter.emit(
        "instruction",
        ReplaceChild.serialize({
          parent: parentRef,
          newChild: newChildRef.id,
          oldChild: oldChildRef,
        })
      );
    }
    return ret as T;
  };

  const originalRemoveChild = ctorWindow.Node.prototype.removeChild;
  ctorWindow.Node.prototype.removeChild = function <T extends Node>(
    child: T
  ): T {
    const parentRef = nodes.findRefFor(this as Node | Element);
    const ret = originalRemoveChild.call(this, child);
    if (isSuppressedNode(child)) {
      return ret as T;
    }
    const childRef = nodes.findRefFor(child as Node | Element);
    if (childRef && childRef.type === "stashed-id" && parentRef) {
      emitter.emit(
        "instruction",
        RemoveChild.serialize({ parentRef, childRef })
      );
    }
    return ret as T;
  };

  const originalCloneNode = ctorWindow.Node.prototype.cloneNode;
  ctorWindow.Node.prototype.cloneNode = function (deep: boolean) {
    const ret = originalCloneNode.call(this, deep);
    const ref = nodes.stash(ret);
    emitter.emit(
      "instruction",
      CloneNode.serialize({ ref, cloneId: ref.id, deep })
    );
    return ret;
  };

  const originalInsertAdjacentElement =
    ctorWindow.Element.prototype.insertAdjacentElement;
  ctorWindow.Element.prototype.insertAdjacentElement = function (
    where: InsertPosition,
    element: Element
  ): Element | null {
    const ret = originalInsertAdjacentElement.call(this, where, element);
    if (isSuppressedNode(element)) {
      return ret;
    }
    const ref = nodes.findRefFor(this as Node | Element);
    const elementRef = nodes.findRefFor(element);
    if (ref && elementRef && elementRef.type === "stashed-id") {
      emitter.emit(
        "instruction",
        InsertAdjacentElement.serialize({ ref, where, element: elementRef.id })
      );
    }
    return ret;
  };

  const originalInsertAdjacentHTML =
    ctorWindow.Element.prototype.insertAdjacentHTML;
  ctorWindow.Element.prototype.insertAdjacentHTML = function (
    where: InsertPosition,
    html: string
  ): void {
    originalInsertAdjacentHTML.call(this, where, html);
    if (hasUnsafeHtml(html)) {
      return;
    }
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit(
        "instruction",
        InsertAdjacentHTML.serialize({ ref, where, html })
      );
    }
  };

  const originalInsertAdjacentText =
    ctorWindow.Element.prototype.insertAdjacentText;
  ctorWindow.Element.prototype.insertAdjacentText = function (
    where: InsertPosition,
    text: string
  ): void {
    originalInsertAdjacentText.call(this, where, text);
    const ref = nodes.findRefFor(this as Node | Element);
    if (ref) {
      emitter.emit(
        "instruction",
        InsertAdjacentText.serialize({ ref, where, text })
      );
    }
  };

  const originalNormalize = ctorWindow.Node.prototype.normalize;
  ctorWindow.Node.prototype.normalize = function (): void {
    originalNormalize.call(this);
    const ref = nodes.findRefFor(this as Node);
    if (ref) {
      emitter.emit("instruction", Normalize.serialize({ ref }));
    }
  };

  const originalPrepend = ctorWindow.Element.prototype.prepend;
  ctorWindow.Element.prototype.prepend = function (
    ...args: (Node | string)[]
  ): void {
    originalPrepend.apply(this, args);
    const parentRef = nodes.findRefFor(this as Node | Element);
    if (!parentRef) {
      return;
    }
    for (const node of args) {
      emitPrependChild(parentRef, node);
    }
  };

  const classAttributeSuppressed = new WeakSet<Element>();
  const styleAttributeSuppressed = new WeakSet<Element>();

  type StashedNodeRef = Extract<NodeRef, { type: "stashed-id" }>;

  const isStashedRef = (ref: NodeRef | null): ref is StashedNodeRef => {
    if (!ref) {
      return false;
    }
    return ref.type === "stashed-id";
  };

  const isReferenceValid = (
    referenceChild: Node | null,
    referenceRef: NodeRef | null
  ): boolean => {
    if (referenceChild === null) {
      return true;
    }
    return referenceRef !== null;
  };

  const getInsertBeforePayload = (
    parentRef: NodeRef | null,
    newChildRef: NodeRef | null,
    referenceChild: Node | null,
    referenceRef: NodeRef | null
  ): {
    parent: NodeRef;
    child: number;
    referenceChild: NodeRef | null;
  } | null => {
    if (!parentRef) {
      return null;
    }
    if (!isStashedRef(newChildRef)) {
      return null;
    }
    if (!isReferenceValid(referenceChild, referenceRef)) {
      return null;
    }
    return {
      parent: parentRef,
      child: newChildRef.id,
      referenceChild: referenceRef ?? null,
    };
  };

  const emitPrependChild = (parentRef: NodeRef, child: Node | string) => {
    if (typeof child === "string") {
      emitPrependText(parentRef, child);
      return;
    }
    if (child instanceof Node) {
      emitPrependNode(parentRef, child);
    }
  };

  const emitPrependNode = (parentRef: NodeRef, node: Node) => {
    if (isSuppressedNode(node)) {
      return;
    }
    const childRef = nodes.findRefFor(node as Node | Element);
    if (!isStashedRef(childRef)) {
      return;
    }
    emitter.emit(
      "instruction",
      PrependChild.serialize({ parent: parentRef, child: childRef.id })
    );
  };

  const emitPrependText = (parentRef: NodeRef, child: string) => {
    emitter.emit(
      "instruction",
      PrependChild.serialize({ parent: parentRef, child })
    );
  };

  const shouldSuppressSetAttribute = (
    element: Element,
    name: string,
    value: string
  ): boolean => {
    if (shouldSkipElementAttribute(element, name, value)) {
      return true;
    }
    if (name === "class" && classAttributeSuppressed.has(element)) {
      return true;
    }
    if (name === "style" && styleAttributeSuppressed.has(element)) {
      return true;
    }
    return false;
  };

  const shouldSuppressRemoveAttribute = (
    element: Element,
    name: string
  ): boolean => {
    if (isExecutableAttributeName(name)) {
      return true;
    }
    return isSuppressedAttributeName(element, name);
  };

  const isExecutableAttributeName = (name: string): boolean => {
    const lowerName = name.toLowerCase();
    return lowerName.startsWith("on") || lowerName === "srcdoc";
  };

  const isSuppressedAttributeName = (
    element: Element,
    name: string
  ): boolean => {
    if (name === "class") {
      return classAttributeSuppressed.has(element);
    }
    if (name === "style") {
      return styleAttributeSuppressed.has(element);
    }
    return false;
  };

  const originalSetAttribute = ctorWindow.Element.prototype.setAttribute;
  ctorWindow.Element.prototype.setAttribute = function (
    name: string,
    value: string
  ) {
    const ret = originalSetAttribute.call(this, name, value);
    const ref = nodes.findRefFor(this as Node | Element);
    if (!ref) {
      return ret;
    }
    if (shouldSuppressSetAttribute(this, name, value)) {
      return ret;
    }
    emitter.emit("instruction", SetAttribute.serialize({ ref, name, value }));
    return ret;
  };

  const originalRemoveAttribute = ctorWindow.Element.prototype.removeAttribute;
  ctorWindow.Element.prototype.removeAttribute = function (name: string) {
    const ret = originalRemoveAttribute.call(this, name);
    const ref = nodes.findRefFor(this as Node | Element);
    if (!ref) {
      return ret;
    }
    if (shouldSuppressRemoveAttribute(this, name)) {
      return ret;
    }
    emitter.emit("instruction", RemoveAttribute.serialize({ ref, name }));
    return ret;
  };

  // Extend Document prototype
  const originalCreateElement = ctorWindow.Document.prototype.createElement;
  ctorWindow.Document.prototype.createElement = function (
    tagName: string,
    options?: ElementCreationOptions
  ): HTMLElement {
    const element = originalCreateElement.call(this, tagName, options);
    if (tagName.toLowerCase() === "script") {
      suppressedNodes.add(element);
      return element;
    }
    const ref = nodes.stash(element);
    emitter.emit(
      "instruction",
      CreateElement.serialize({ tagName, refId: ref.id, is: options?.is })
    );
    return element;
  };

  const originalCreateTextNode = ctorWindow.Document.prototype.createTextNode;
  ctorWindow.Document.prototype.createTextNode = function (data: string): Text {
    console.log("document: create text node", data);
    const textNode = originalCreateTextNode.call(this, data);
    const ref = nodes.stash(textNode);
    emitter.emit(
      "instruction",
      CreateTextNode.serialize({ refId: ref.id, data })
    );
    return textNode;
  };

  const originalCreateDocumentFragment =
    ctorWindow.Document.prototype.createDocumentFragment;
  ctorWindow.Document.prototype.createDocumentFragment =
    function (): DocumentFragment {
      const fragment = originalCreateDocumentFragment.call(this);
      const ref = nodes.stash(fragment);
      emitter.emit(
        "instruction",
        CreateDocumentFragment.serialize({ refId: ref.id })
      );
      return fragment;
    };

  // Override normal properties
  function extendPrototypeProperties(
    prototype: object,
    _nodes: NodeStash,
    _emitter: DomEmitter
  ) {
    for (const prop of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
      if (descriptor?.set) {
        const originalSetter = descriptor.set;
        Object.defineProperty(prototype, prop, {
          ...descriptor,
          set(this: Element, value: unknown) {
            originalSetter.call(this, value);
            emitProperty(this, prop, value);
          },
        });
      } else if (descriptor?.writable) {
        // Add handling for regular writable properties
        const originalValue = descriptor.value;
        const prefix = "___";
        Object.defineProperty(prototype, prop, {
          get(this: Element & Record<string, unknown>) {
            return this[prefix + prop] || originalValue;
          },
          set(this: Element & Record<string, unknown>, value: unknown) {
            this[prefix + prop] = value;
            emitProperty(this, prop, value);
          },
          configurable: true,
          enumerable: true,
        });
      }
    }
  }

  extendPrototypeProperties(ctorWindow.Node.prototype, nodes, emitter);
  extendPrototypeProperties(ctorWindow.Element.prototype, nodes, emitter);
  extendPrototypeProperties(ctorWindow.Text.prototype, nodes, emitter);
  extendPrototypeProperties(ctorWindow.HTMLElement.prototype, nodes, emitter);
  extendPrototypeProperties(
    ctorWindow.HTMLInputElement.prototype,
    nodes,
    emitter
  );
  extendPrototypeProperties(
    ctorWindow.HTMLTextAreaElement.prototype,
    nodes,
    emitter
  );
  extendPrototypeProperties(
    ctorWindow.HTMLButtonElement.prototype,
    nodes,
    emitter
  );
  extendPrototypeProperties(
    ctorWindow.HTMLAnchorElement.prototype,
    nodes,
    emitter
  );
  extendPrototypeProperties(
    ctorWindow.HTMLImageElement.prototype,
    nodes,
    emitter
  );
  extendPrototypeProperties(
    ctorWindow.HTMLFormElement.prototype,
    nodes,
    emitter
  );

  const innerTextTargets: object[] = [
    ctorWindow.HTMLElement.prototype,
    ctorWindow.Element.prototype,
  ];
  for (const prototype of innerTextTargets) {
    const innerTextDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      "innerText"
    );
    if (innerTextDescriptor?.set) {
      Object.defineProperty(prototype, "innerText", {
        ...innerTextDescriptor,
        set(this: HTMLElement, value: string) {
          innerTextDescriptor.set?.call(this, value);
          emitProperty(this, "innerText", value);
        },
      });
      return;
    }
    Object.defineProperty(prototype, "innerText", {
      get(this: HTMLElement) {
        return this.textContent ?? "";
      },
      set(this: HTMLElement, value: string) {
        this.textContent = value;
        emitProperty(this, "innerText", value);
      },
      configurable: true,
      enumerable: true,
    });
  }

  const tokenListElements = new WeakMap<DOMTokenList, Element>();
  const styleElements = new WeakMap<CSSStyleDeclaration, Element>();

  const classListDescriptor = Object.getOwnPropertyDescriptor(
    ctorWindow.Element.prototype,
    "classList"
  );
  if (classListDescriptor?.get) {
    Object.defineProperty(ctorWindow.Element.prototype, "classList", {
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

  const stylePropertyDescriptor = Object.getOwnPropertyDescriptor(
    ctorWindow.HTMLElement.prototype,
    "style"
  );
  if (stylePropertyDescriptor?.get) {
    Object.defineProperty(ctorWindow.HTMLElement.prototype, "style", {
      ...stylePropertyDescriptor,
      get(this: HTMLElement) {
        const style = stylePropertyDescriptor.get?.call(
          this
        ) as CSSStyleDeclaration;
        if (style) {
          styleElements.set(style, this);
        }
        return style;
      },
    });
  }

  type DomTokenListWithElement = DOMTokenList & {
    _element?: Element;
    ownerElement?: Element;
  };
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
    const value = element.getAttribute("class");
    if (value === null || value === "") {
      emitter.emit(
        "instruction",
        RemoveAttribute.serialize({ ref, name: "class" })
      );
    } else {
      emitter.emit(
        "instruction",
        SetAttribute.serialize({ ref, name: "class", value })
      );
    }
  };

  const originalTokenListAdd = ctorWindow.DOMTokenList.prototype.add;
  ctorWindow.DOMTokenList.prototype.add = function (...tokens: string[]): void {
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

  const originalTokenListRemove = ctorWindow.DOMTokenList.prototype.remove;
  ctorWindow.DOMTokenList.prototype.remove = function (
    ...tokens: string[]
  ): void {
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

  const originalTokenListToggle = ctorWindow.DOMTokenList.prototype.toggle;
  ctorWindow.DOMTokenList.prototype.toggle = function (
    token: string,
    force?: boolean
  ): boolean {
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

  const originalTokenListReplace = ctorWindow.DOMTokenList.prototype.replace;
  if (typeof originalTokenListReplace === "function") {
    ctorWindow.DOMTokenList.prototype.replace = function (
      token: string,
      newToken: string
    ): boolean {
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

  type StyleDeclarationWithElement = CSSStyleDeclaration & {
    _element?: Element;
    ownerElement?: Element;
  };
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
    const value = element.getAttribute("style");
    if (value === null || value === "") {
      emitter.emit(
        "instruction",
        RemoveAttribute.serialize({ ref, name: "style" })
      );
    } else {
      emitter.emit(
        "instruction",
        SetAttribute.serialize({ ref, name: "style", value })
      );
    }
  };

  const originalStyleSetProperty =
    ctorWindow.CSSStyleDeclaration.prototype.setProperty;
  ctorWindow.CSSStyleDeclaration.prototype.setProperty = function (
    property: string,
    value: string | null,
    priority?: string
  ): void {
    const element = getStyleElement(this);
    if (
      element &&
      element instanceof ctorWindow.HTMLElement &&
      (element as HTMLElement).style === this
    ) {
      styleAttributeSuppressed.add(element);
      originalStyleSetProperty.call(this, property, value, priority);
      styleAttributeSuppressed.delete(element);
      emitStyleAttribute(element);
      return;
    }
    originalStyleSetProperty.call(this, property, value, priority);
  };

  const originalStyleRemoveProperty =
    ctorWindow.CSSStyleDeclaration.prototype.removeProperty;
  ctorWindow.CSSStyleDeclaration.prototype.removeProperty = function (
    property: string
  ): string {
    const element = getStyleElement(this);
    if (
      element &&
      element instanceof ctorWindow.HTMLElement &&
      (element as HTMLElement).style === this
    ) {
      styleAttributeSuppressed.add(element);
      const result = originalStyleRemoveProperty.call(this, property);
      styleAttributeSuppressed.delete(element);
      emitStyleAttribute(element);
      return result;
    }
    return originalStyleRemoveProperty.call(this, property);
  };

  const styleTextDescriptor = Object.getOwnPropertyDescriptor(
    ctorWindow.CSSStyleDeclaration.prototype,
    "cssText"
  );
  if (styleTextDescriptor?.set) {
    Object.defineProperty(ctorWindow.CSSStyleDeclaration.prototype, "cssText", {
      ...styleTextDescriptor,
      set(this: CSSStyleDeclaration, value: string) {
        const element = getStyleElement(this);
        if (
          element &&
          element instanceof ctorWindow.HTMLElement &&
          (element as HTMLElement).style === this
        ) {
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
