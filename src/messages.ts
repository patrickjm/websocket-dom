import type { SerializedEvent } from "./client/types";
import type { Serialized } from "./dom/types";

export interface InstructionMessage {
  type: 'instructions';
  instructions: Serialized.Instruction[];
}

export interface ErrorMessage {
  type: 'error';
  error: string;
  errorInfo: string;
}

export interface EventMessage {
  type: 'event';
  event: SerializedEvent;
}

export type Message = InstructionMessage | ErrorMessage | EventMessage;
