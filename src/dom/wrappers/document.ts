import type { DOMWindow } from "jsdom";
import type { NodeRef, Nodes } from "../nodes";
import { Serialized, type DomEmitter } from "../types";
import { wrap } from "../";

export interface DocumentFnArgs {
  window: DOMWindow;
  document: Document;
  nodes: Nodes;
  ref?: NodeRef;
  emitter: DomEmitter;
}

export function createElement(args: DocumentFnArgs, ...createArgs: Parameters<typeof Document.prototype.createElement>) {
  const { window, document, nodes, emitter } = args;
  const element = (document.createElement as Function).bind(document)(...createArgs);
  const ref = nodes.stash(element);
  emitter.emit('instruction', Serialized.createElement(element.tagName, ref.id, createArgs[1]?.is));
  return wrap(window, element, nodes, emitter);
}