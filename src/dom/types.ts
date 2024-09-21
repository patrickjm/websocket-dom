import type TypedEmitter from "typed-emitter";
import type { NodeRef, StashedIdNodeRef } from "./nodes";


export type DomEmitterEvents = {
  instruction: (instruction: Serialized.Instruction) => void;
  flush: () => void;
}
export type DomEmitter = TypedEmitter<DomEmitterEvents>;

export const enum InstructionType {
  Create,
  SetAttribute,
  SetProperty,
  AppendChild,
}

export namespace Serialized {
  export function create(type: "element", { tagName, refId, is }: { tagName: string, refId: StashedIdNodeRef['id'], is?: string }): [InstructionType.Create, "element", string, StashedIdNodeRef['id'], string | undefined];
  export function create(type: "text", data: string): [InstructionType.Create, "text", string];
  export function create(type: "fragment", refId: StashedIdNodeRef['id']): [InstructionType.Create, "fragment", StashedIdNodeRef['id']];
  export function create(type: "element"|"text"|"fragment", args: any) {
    if (type === "element") {
      const [tagName, refId, is] = args;
      return [InstructionType.Create, type, tagName, refId, is];
    } else if (type === "text") {
      const [data] = args;
      return [InstructionType.Create, type, data];
    } else if (type === "fragment") {
      const [refId] = args;
      return [InstructionType.Create, type, refId];
    }
    throw new Error(`Invalid create type: ${type}`);
  }
  export type Create = [InstructionType.Create, "element", string, StashedIdNodeRef['id'], string]
    | [InstructionType.Create, "text", string]
    | [InstructionType.Create, "fragment", StashedIdNodeRef['id']];
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

  export type Instruction = Create 
    | SetAttribute 
    | SetProperty 
    | AppendChild
}

export namespace Deserialized {
  export function create(instruction: Serialized.Create) {
    const type = instruction[1];
    if (type === "element") {
      return {
        type: InstructionType.Create,
        tagName: instruction[2],
        refId: instruction[3],
        is: instruction[4],
      };
    } else if (type === "text") {
      return {
        type: InstructionType.Create,
        data: instruction[2],
      };
    } else if (type === "fragment") {
      return {
        type: InstructionType.Create,
        refId: instruction[2],
      };
    }
    throw new Error(`Invalid create type: ${type}`);
  }
  export type Create = ReturnType<typeof create>;
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
      case InstructionType.Create:
        return create(instruction);
      case InstructionType.SetAttribute:
        return setAttribute(instruction);
      case InstructionType.SetProperty:
        return setProperty(instruction);
      case InstructionType.AppendChild:
        return appendChild(instruction);
    }
  }

  export type Instruction = Create 
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
