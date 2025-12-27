import type { SerializedEvent } from "./client/types";
import type { Serialized } from "./dom/instructions";

export interface InstructionMessage {
  type: 'instructions';
  instructions: readonly Serialized[];
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

export interface ReadyMessage {
  type: 'ready';
}

export interface SnapshotMessage {
  type: 'snapshot';
  htmlAttributes: [string, string][];
  headAttributes: [string, string][];
  bodyAttributes: [string, string][];
  headHtml: string;
  bodyHtml: string;
}

export type Message = InstructionMessage | ErrorMessage | EventMessage | ReadyMessage | SnapshotMessage;
