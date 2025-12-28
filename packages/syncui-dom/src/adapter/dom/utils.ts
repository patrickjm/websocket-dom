import type { SerializedEvent } from "syncui/core/protocol/events";
import type { SnapshotMessage } from "syncui/core/protocol/messages";
import type { Serialized } from "syncui/core/ops/instructions";

export type MessageToWorker =
  | {
      type: "init-dom";
      doc: string;
      url: string;
    }
  | {
      type: "snapshot-request";
      id: string;
    }
  | {
      type: "client-event";
      event: SerializedEvent;
    }
  | {
      type: "dom-import";
      url: string;
    }
  | {
      type: "eval-string";
      code: string;
      id: string;
    };

export type MessageFromWorker =
  | {
      type: "instruction";
      instruction: Serialized;
    }
  | {
      type: "snapshot";
      id: string;
      snapshot: SnapshotMessage;
    }
  | {
      type: "eval-result";
      jsonString: string;
      id: string;
    };

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
    },
  };
}
