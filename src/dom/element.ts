import type { DOMWindow } from "jsdom";
import type { NodeRef, Nodes } from "./nodes";
import { Serialized, type DomEmitter } from "./types";

export interface ElementFnArgs {
  window: DOMWindow;
  element: Element;
  nodes: Nodes;
  ref?: NodeRef;
  emitter: DomEmitter;
}

export function setAttribute(args: ElementFnArgs, name: string, value: string) {
  const { element, ref, emitter } = args;
  element.setAttribute(name, value);
  if (!ref) {
    return;
  }
  emitter.emit('instruction', Serialized.setAttribute(ref, name, value));
}

export function appendChild(args: ElementFnArgs, child: Element) {
  const { element, nodes, ref, emitter } = args;
  element.appendChild(child);
  const childRef = nodes.findRefFor(child);
  if (!ref || !childRef) {
    return;
  }
  emitter.emit('instruction', Serialized.appendChild(ref, childRef));
}

export function isSameNode(args: ElementFnArgs, node: Node) {
  const { element, nodes, ref, emitter } = args;
  return element.isSameNode(node) || node.isSameNode(element);
}