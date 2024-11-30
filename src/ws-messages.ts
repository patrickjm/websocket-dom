import type { SerializedEvent } from "./client/types";
import type { Serialized } from "./dom/instructions";

export interface InstructionMessage {
  type: 'wsdom-instr';
  instructions: readonly Serialized[];
}

export interface ErrorMessage {
  type: 'wsdom-err';
  error: string;
  errorInfo: string;
}

export interface EventMessage {
  type: 'wsdom-event';
  event: SerializedEvent;
}

export type Message = InstructionMessage | ErrorMessage | EventMessage;
