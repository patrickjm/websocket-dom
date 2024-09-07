import type TypedEmitter from "typed-emitter";
import type { NodeRef, StashedIdNodeRef } from "./nodes";


export type DomEmitterEvents = {
  instruction: (instruction: Serialized.Instruction) => void;
  flush: () => void;
}
export type DomEmitter = TypedEmitter<DomEmitterEvents>;

export const enum InstructionType {
  CreateElement,
  SetAttribute,
  SetProperty,
  AppendChild,
}

export namespace Serialized {
  export function createElement(tagName: string, refId: StashedIdNodeRef['id'], is?: string) {
    const ret = [InstructionType.CreateElement, tagName, refId];
    if (is) ret.push(is);
    return ret as [InstructionType.CreateElement, string, StashedIdNodeRef['id'], string?];
  }
  export type CreateElement = ReturnType<typeof createElement>;
  export function setAttribute(ref: NodeRef, name: string, value: string) {
    return [InstructionType.SetAttribute, ref, name, value] as [InstructionType.SetAttribute, NodeRef, string, string];
  }
  export type SetAttribute = ReturnType<typeof setAttribute>;
  export function setProperty(ref: NodeRef, name: string, value: string) {
    return [InstructionType.SetProperty, ref, name, value] as [InstructionType.SetProperty, NodeRef, string, string];
  }
  export type SetProperty = ReturnType<typeof setProperty>;
  export function appendChild(parent: NodeRef, child: NodeRef) {
    return [InstructionType.AppendChild, parent, child] as [InstructionType.AppendChild, NodeRef, NodeRef];
  }
  export type AppendChild = ReturnType<typeof appendChild>;

  export type Instruction = CreateElement 
    | SetAttribute 
    | SetProperty 
    | AppendChild;
}

export namespace Deserialized {
  export function createElement(instruction: Serialized.CreateElement) {
    return {
      type: InstructionType.CreateElement as InstructionType.CreateElement,
      tagName: instruction[1],
      refId: instruction[2],
      is: instruction[3],
    };
  }
  export type CreateElement = ReturnType<typeof createElement>;
  export function setAttribute(instruction: Serialized.SetAttribute) {
    return {
      type: InstructionType.SetAttribute as InstructionType.SetAttribute,
      ref: instruction[1],
      name: instruction[2],
      value: instruction[3],
    };
  }
  export type SetAttribute = ReturnType<typeof setAttribute>;
  export function setProperty(instruction: Serialized.SetProperty) {
    return {
      type: InstructionType.SetProperty as InstructionType.SetProperty,
      ref: instruction[1],
      name: instruction[2],
      value: instruction[3],
    };
  }
  export type SetProperty = ReturnType<typeof setProperty>;
  export function appendChild(instruction: Serialized.AppendChild) {
    return {
      type: InstructionType.AppendChild as InstructionType.AppendChild,
      parent: instruction[1],
      child: instruction[2],
    };
  }
  export type AppendChild = ReturnType<typeof appendChild>;

  export function instruction(instruction: Serialized.Instruction) {
    switch (instruction[0]) {
      case InstructionType.CreateElement:
        return createElement(instruction);
      case InstructionType.SetAttribute:
        return setAttribute(instruction);
      case InstructionType.SetProperty:
        return setProperty(instruction);
      case InstructionType.AppendChild:
        return appendChild(instruction);
    }
  }

  export type Instruction = CreateElement 
    | SetAttribute 
    | SetProperty 
    | AppendChild;
}

// export interface SerializedNode {
//   type: 'element' | 'text';
//   tagName?: string;
//   props?: Record<string, any>;
//   children?: SerializedNode[];
//   content?: string;
// }

// export interface CreateInstanceInstruction {
//   type: 'createInstance';
//   node: SerializedNode;
//   refId: StashedIdNodeRef['id'];
// }

// export type AppendChildInstruction = {
//   type: 'appendChild';
//   parent: NodeRef;
//   child: SerializedNode;
// } | {
//   type: 'appendChild';
//   parent: NodeRef;
//   ref: NodeRef;
// }

// export interface CommitUpdateInstruction {
//   type: 'commitUpdate';
//   ref: NodeRef;
//   upsertProps: Record<string, any>;
//   removeProps: string[];
// }

// export interface CommitTextUpdateInstruction {
//   type: 'commitTextUpdate';
//   ref: NodeRef;
//   newText: string;
// }

// export interface RemoveChildInstruction {
//   type: 'removeChild';
//   ref: NodeRef;
// }

// export interface ClearContainerInstruction {
//   type: 'clearContainer';
//   container: NodeRef;
// }

// export type Instruction = AppendChildInstruction 
//   | CommitUpdateInstruction 
//   | CommitTextUpdateInstruction 
//   | RemoveChildInstruction
//   | ClearContainerInstruction
//   | CreateInstanceInstruction;
