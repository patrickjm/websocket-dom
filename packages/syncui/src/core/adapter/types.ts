import type { SerializedEvent } from "../protocol/events";
import type { SnapshotMessage } from "../protocol/messages";
import type { DomEmitter } from "../ops/instructions";

export type UiAdapterFactory = (
  doc: string,
  options: { url: string }
) => UiAdapter;

export interface UiAdapter {
  emitter: DomEmitter;
  dispatchEvent(event: SerializedEvent): void;
  domImport(url: string): void;
  terminate(): void;
  evalString(code: string): Promise<unknown>;
  getSnapshot(): Promise<SnapshotMessage>;
  worker?: { postMessage: (message: unknown) => void };
}
