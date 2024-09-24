import type TypedEmitter from "typed-emitter";
import type { NodeRef, NodeStash, StashedIdNodeRef } from "./nodes";


export type DomEmitterEvents = {
  instruction: (instruction: Serialized) => void;
  flush: () => void;
}
export type DomEmitter = TypedEmitter<DomEmitterEvents>;



export type Serialized = readonly any[];

interface InstructionApplyArgs {
  window: Window;
  nodes: NodeStash;
}

export enum InstructionType {
  CreateElement = "createElement",
  CreateTextNode = "createTextNode",
  CreateDocumentFragment = "createDocumentFragment",
  RemoveChild = "removeChild",
  AppendChild = "appendChild",
  SetProperty = "setProperty",
  SetAttribute = "setAttribute",
}

export namespace CreateElement {
  export type Data = {
    tagName: string;
    refId: StashedIdNodeRef['id'];
    is?: string;
  }
  export type Serialized = [InstructionType.CreateElement, string, StashedIdNodeRef['id'], string?]
  export function serialize(data: Data): Serialized {
    return [InstructionType.CreateElement, data.tagName, data.refId, data.is] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      tagName: data[1],
      refId: data[2],
      is: data[3],
    }
  }
  export function apply({ window, nodes }: InstructionApplyArgs, data: Data): void {
    const element = window.document.createElement(data.tagName, { is: data.is });
    nodes.stash(element, data.refId);
  }
}


export namespace CreateTextNode {
  export type Data = {
    data: string;
    refId: StashedIdNodeRef['id'];
  }
  export type Serialized = [InstructionType.CreateTextNode, string, StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [InstructionType.CreateTextNode, data.data, data.refId] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      data: data[1],
      refId: data[2],
    }
  }
  export function apply({ window, nodes }: InstructionApplyArgs, data: Data): void {
    const text = window.document.createTextNode(data.data);
    nodes.stash(text, data.refId);
  }
}

export namespace CreateDocumentFragment {
  export type Data = {
    refId: StashedIdNodeRef['id'];
  }
  export type Serialized = [InstructionType.CreateDocumentFragment, StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [InstructionType.CreateDocumentFragment, data.refId] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      refId: data[1],
    }
  }
  export function apply({ window, nodes }: InstructionApplyArgs, data: Data): void {
    const fragment = window.document.createDocumentFragment();
    nodes.stash(fragment, data.refId);
  }
}

export namespace RemoveChild {
  export type Data = {
    parentRef: NodeRef;
    childRef: NodeRef;
  }
  export type Serialized = [InstructionType.RemoveChild, NodeRef, NodeRef]
  export function serialize(data: Data): Serialized {
    return [InstructionType.RemoveChild, data.parentRef, data.childRef] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      parentRef: data[1],
      childRef: data[2],
    }
  }
  export function apply({ nodes }: InstructionApplyArgs, data: Data): void {
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
  export type Serialized = [InstructionType.AppendChild, NodeRef, StashedIdNodeRef['id']]
  export function serialize(data: Data): Serialized {
    return [InstructionType.AppendChild, data.parent, data.child] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      parent: data[1],
      child: data[2],
    }
  }
  export function apply({ nodes }: InstructionApplyArgs, data: Data): void {
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
  export type Serialized = [InstructionType.SetProperty, NodeRef, string, string]
  export function serialize(data: Data): Serialized {
    return [InstructionType.SetProperty, data.ref, data.name, data.value] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      name: data[2],
      value: data[3],
    }
  }
  export function apply({ nodes }: InstructionApplyArgs, data: Data): void {
    const element = nodes.get(data.ref);
    if (element && element instanceof Element) {
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
  export type Serialized = [InstructionType.SetAttribute, NodeRef, string, string]
  export function serialize(data: Data): Serialized {
    return [InstructionType.SetAttribute, data.ref, data.name, data.value] as const;
  }
  export function deserialize(data: Serialized): Data {
    return {
      ref: data[1],
      name: data[2],
      value: data[3],
    }
  }
  export function apply({ nodes }: InstructionApplyArgs, data: Data): void {
    const element = nodes.get(data.ref);
    if (element && element instanceof Element) {
      element.setAttribute(data.name, data.value);
    }
  }
}