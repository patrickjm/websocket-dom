import type { SerializedEvent } from "./event";
import type { SerializedMutation } from "./dom/mutations";

export interface MutationMessage {
  type: 'wsdom-mutation';
  mutations: readonly SerializedMutation[];
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

export interface ClientLogMessage {
  type: 'wsdom-client-log';
  jsonStrings: string[];
  level: "log" | "debug" | "warn" | "error" | "trace";
}

export type Message = MutationMessage | ErrorMessage | EventMessage | ClientLogMessage;
