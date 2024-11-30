import type TypedEmitter from "typed-emitter";
import type { NodeRef, NodeStash, StashedIdNodeRef } from "./nodes";
import type { WebsocketDOMLogger } from "index";


export type DomEmitterEvents = {
  mutation: (mutation: SerializedMutation) => void;
  evalResult: (result: { id: string, jsonString: string }) => void;
  workerMessage: (message: unknown) => void;
  clientLog: (level: "log" | "debug" | "warn" | "error" | "trace", jsonStrings: string[]) => void;
}
export type DomEmitter = TypedEmitter<DomEmitterEvents>;



export type SerializedMutation = readonly any[];

interface MutationApplyArgs {
  window: Window;
  nodes: NodeStash;
  logger?: WebsocketDOMLogger;
}

export enum MutationType {
  CreateElement = "createElement",
  RemoveElement = "removeElement",
  CreateTextNode = "createTextNode",
  CreateDocumentFragment = "createDocumentFragment",
  RemoveChild = "removeChild",
  AppendChild = "appendChild",
  SetProperty = "setProperty",
  SetAttribute = "setAttribute",
  CloneNode = "cloneNode",
  InsertAdjacentElement = "insertAdjacentElement",
  InsertAdjacentHTML = "insertAdjacentHTML",
  InsertAdjacentText = "insertAdjacentText",
  PrependChild = "prependChild",
  Normalize = "normalize",
}

export namespace CreateElement {
  export type Data = {
    tagName: string;
    refId: StashedIdNodeRef['id'];
    is?: string;
  }
  export type Serialized = [MutationType.CreateElement, string, StashedIdNodeRef['id'], string?]
  export function serialize(data: Data): Serialized {
    return [MutationType.CreateElement, data.tagName, data.refId, data.is] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      tagName: data[1],
      refId: data[2],
      is: data[3],
    }
  }
  export function apply({ window, nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: CreateElement', data);
    const element = window.document.createElement(data.tagName, { is: data.is });
    nodes.stash(element, data.refId);
  }
}

export namespace RemoveElement {
  export type Data = {
    ref: NodeRef;
  }
  export type Serialized = [MutationType.RemoveElement, NodeRef]
  export function serialize(data: Data): Serialized {
    return [MutationType.RemoveElement, data.ref] as const;
  }
  export function deserialize(data: Serialized): Data {
    return { ref: data[1] };
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: RemoveElement', data);
    const element = nodes.get(data.ref) as Element;
    if (element) {
      element.remove();
    }
  }
}

export namespace CreateTextNode {
  export type Data = {
    data: string;
    refId: StashedIdNodeRef['id'];
  }
  export type Serialized = [MutationType.CreateTextNode, string, StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [MutationType.CreateTextNode, data.data, data.refId] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      data: data[1],
      refId: data[2],
    }
  }
  export function apply({ window, nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: CreateTextNode', data);
    const text = window.document.createTextNode(data.data);
    nodes.stash(text, data.refId);
  }
}

export namespace CreateDocumentFragment {
  export type Data = {
    refId: StashedIdNodeRef['id'];
  }
  export type Serialized = [MutationType.CreateDocumentFragment, StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [MutationType.CreateDocumentFragment, data.refId] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      refId: data[1],
    }
  }
  export function apply({ window, nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: CreateDocumentFragment', data);
    const fragment = window.document.createDocumentFragment();
    nodes.stash(fragment, data.refId);
  }
}

export namespace RemoveChild {
  export type Data = {
    parentRef: NodeRef;
    childRef: NodeRef;
  }
  export type Serialized = [MutationType.RemoveChild, NodeRef, NodeRef]
  export function serialize(data: Data): Serialized {
    return [MutationType.RemoveChild, data.parentRef, data.childRef] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      parentRef: data[1],
      childRef: data[2],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: RemoveChild', data);
    const parent = nodes.get(data.parentRef);
    const child = nodes.get(data.childRef);
    if (parent && child) {
      parent.removeChild(child);
    }
  }
}

export namespace AppendChild {
  export type Data = {
    parent: NodeRef;
    child: StashedIdNodeRef['id'];
  }
  export type Serialized = [MutationType.AppendChild, NodeRef, StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [MutationType.AppendChild, data.parent, data.child] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      parent: data[1],
      child: data[2],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: AppendChild', data);
    const parent = nodes.get(data.parent);
    const childRef = { type: "stashed-id", id: data.child } as StashedIdNodeRef;
    const child = nodes.get(childRef);
    if (parent && child) {
      parent.appendChild(child);
      nodes.unstash(childRef);
    }
  }
}

export namespace SetProperty {
  export type Data = {
    ref: NodeRef;
    name: string;
    value: string;
  }
  export type Serialized = [MutationType.SetProperty, NodeRef, string, string]
  export function serialize(data: Data): Serialized {
    return [MutationType.SetProperty, data.ref, data.name, data.value] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      name: data[2],
      value: data[3],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    const element = nodes.get(data.ref);
    logger?.debug('WebsocketDOM Mutation: SetProperty', data);
    if (element) {
      (element as any)[data.name] = data.value;
    }
  }
}

export namespace SetAttribute {
  export type Data = {
    ref: NodeRef;
    name: string;
    value: string;
  }
  export type Serialized = [MutationType.SetAttribute, NodeRef, string, string]
  export function serialize(data: Data): Serialized {
    return [MutationType.SetAttribute, data.ref, data.name, data.value] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      name: data[2],
      value: data[3],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: SetAttribute', data);
    const element = nodes.get(data.ref);
    if (element && element instanceof Element) {
      element.setAttribute(data.name, data.value);
    }
  }
}

export namespace CloneNode {
  export type Data = {
    ref: NodeRef;
    cloneId: StashedIdNodeRef['id'];
    deep: boolean;
  }
  export type Serialized = [MutationType.CloneNode, NodeRef, StashedIdNodeRef['id'], boolean]
  export function serialize(data: Data): Serialized {
    return [MutationType.CloneNode, data.ref, data.cloneId, data.deep] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      cloneId: data[2],
      deep: data[3],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: CloneNode', data);
    const node = nodes.get(data.ref);
    const clonedNode = node!.cloneNode(data.deep);
    nodes.stash(clonedNode, data.cloneId);
  }
}

export namespace InsertAdjacentElement {
  export type Data = {
    ref: NodeRef;
    where: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
    element: StashedIdNodeRef['id'];
  }
  export type Serialized = [MutationType.InsertAdjacentElement, NodeRef, 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend', StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [MutationType.InsertAdjacentElement, data.ref, data.where, data.element] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      where: data[2],
      element: data[3],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: InsertAdjacentElement', data);
    const element = nodes.get(data.ref) as Element;
    const toInsert = nodes.get({ type: "stashed-id", id: data.element } as StashedIdNodeRef)!;
    if (element && toInsert) {
      element.insertAdjacentElement(data.where, toInsert as Element);
    }
  }
}

export namespace InsertAdjacentHTML {
  export type Data = {
    ref: NodeRef;
    where: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
    html: string;
  }
  export type Serialized = [MutationType.InsertAdjacentHTML, NodeRef, 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend', string]
  export function serialize(data: Data): Serialized {
    return [MutationType.InsertAdjacentHTML, data.ref, data.where, data.html] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      where: data[2],
      html: data[3],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: InsertAdjacentHTML', data);
    const element = nodes.get(data.ref) as Element;
    if (element) {
      element.insertAdjacentHTML(data.where, data.html);
    }
  }
}

export namespace InsertAdjacentText {
  export type Data = {
    ref: NodeRef;
    where: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
    text: string;
  }
  export type Serialized = [MutationType.InsertAdjacentText, NodeRef, 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend', string]
  export function serialize(data: Data): Serialized {
    return [MutationType.InsertAdjacentText, data.ref, data.where, data.text] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      where: data[2],
      text: data[3],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: InsertAdjacentText', data);
    const element = nodes.get(data.ref) as Element;
    if (element) {
      element.insertAdjacentText(data.where, data.text);
    }
  }
}

export namespace PrependChild {
  export type Data = {
    parent: NodeRef;
    child: StashedIdNodeRef['id'] | string;
  }
  export type Serialized = [MutationType.PrependChild, NodeRef, StashedIdNodeRef['id'] | string]
  export function serialize(data: Data): Serialized {
    return [MutationType.PrependChild, data.parent, data.child] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      parent: data[1],
      child: data[2],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: PrependChild', data);
    const parent = nodes.get(data.parent) as Element;
    let child: Node;
    if (typeof data.child === 'string') {
      child = document.createTextNode(data.child);
    } else {
      const childRef = { type: 'stashed-id', id: data.child } as StashedIdNodeRef;
      child = nodes.get(childRef) as Node;
      if (child) {
        nodes.unstash(childRef);
      }
    }
    if (parent && child) {
      parent.prepend(child);
    }
  }
}

export namespace Normalize {
  export type Data = {
    ref: NodeRef;
  }
  export type Serialized = [MutationType.Normalize, NodeRef]
  export function serialize(data: Data): Serialized {
    return [MutationType.Normalize, data.ref] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
    }
  }
  export function apply({ nodes, logger }: MutationApplyArgs, data: Data): void {
    logger?.debug('WebsocketDOM Mutation: Normalize', data);
    const node = nodes.get(data.ref);
    if (node) {
      node.normalize();
    }
  }
}
