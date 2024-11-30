import type { SerializedEvent } from "client/types";
import type { SerializedMutation } from "./mutations";

export type MessageToWorker = {
  type: "init-dom";
  doc: string;
  url: string;
} | {
  type: "client-event";
  event: SerializedEvent;
} | {
  type: "dom-import";
  url: string;
} | {
  type: "eval-string";
  code: string;
  id: string;
} | {
  type: "worker-message";
  jsonString: string;
} | {
  type: "request-initial-dom";
}

export type MessageFromWorker = {
  type: "mutation";
  mutation: SerializedMutation;
} | {
  type: "eval-result";
  jsonString: string;
  id: string;
} | {
  type: "worker-message";
  jsonString: string;
} | {
  type: "client-log";
  jsonStrings: string[];
  level: "log" | "debug" | "warn" | "error" | "trace";
}

export function createBrowserStorage() {
  let storage = new Map<string, string>();
  return {
    get length() {
      return storage.size;
    },
    key(index: number): string | null {
      const keys = Array.from(storage.keys());
      return index >= keys.length ? null : keys[index];
    },
    getItem(key: string): string | null {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, String(value));
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    }
  };
}