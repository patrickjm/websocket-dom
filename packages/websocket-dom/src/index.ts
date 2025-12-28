import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import { WebSocket } from "ws";
import type { SerializedEvent } from "./client/types";
import { createDom } from "./dom";
import { type Serialized } from "./dom/instructions";
import type { InstructionMessage, Message } from "./ws-messages";

export type {
  BaseSerializedEvent,
  SerializedChangeEvent,
  SerializedClickEvent,
  SerializedEvent,
  SerializedFocusEvent,
  SerializedInputEvent,
  SerializedKeyboardEvent,
  SerializedMouseEvent,
  SerializedSubmitEvent,
} from "./client/types";
export { getXPath } from "./shared-utils";

export type WebsocketDomEvents = {
  clientEvent: (event: SerializedEvent) => void;
};

export type WebsocketDomOptions = {
  websocket?: WebSocket | null;
  htmlDocument: string;
  url: string;
};

export class WebsocketDOM {
  private ws: WebSocket | null = null;
  private readonly dom: ReturnType<typeof createDom>;
  private readonly publicEmitter: TypedEmitter<WebsocketDomEvents>;
  private readonly batch: { instructions: Serialized[] } = { instructions: [] };
  private readonly pending: Serialized[] = [];
  private clientReady = false;
  private snapshotSent = false;
  private snapshotInFlight: Promise<void> | null = null;
  private wsMessageHandler?: (buffer: Buffer) => void;

  public readonly worker: ReturnType<typeof createDom>["worker"];

  constructor(options: WebsocketDomOptions) {
    const { websocket, htmlDocument, url } = options;
    this.dom = createDom(htmlDocument, { url });
    this.worker = this.dom.worker;
    this.publicEmitter = new EventEmitter() as TypedEmitter<WebsocketDomEvents>;

    this.dom.emitter.on("instruction", (instruction: Serialized) => {
      if (!this.clientReady) {
        this.pending.push(instruction);
        return;
      }
      this.batch.instructions.push(instruction);
      setTimeout(() => this.flush(), 0);
    });

    if (websocket) {
      this.setWebsocket(websocket);
    }
  }

  get emitter() {
    return this.publicEmitter;
  }

  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  setWebsocket(ws: WebSocket | null) {
    if (this.ws && this.wsMessageHandler) {
      this.ws.off("message", this.wsMessageHandler);
    }
    this.ws = ws;
    this.clientReady = false;
    this.snapshotSent = false;
    this.pending.splice(0, this.pending.length);
    if (!ws) {
      return;
    }
    this.wsMessageHandler = (buffer: Buffer) => {
      this.handleMessage(buffer);
    };
    ws.on("message", this.wsMessageHandler);
  }

  import(url: string) {
    this.dom.domImport(url);
  }

  domImport(url: string) {
    this.import(url);
  }

  dispatchEvent(event: SerializedEvent) {
    this.dom.dispatchEvent(event);
    this.publicEmitter.emit("clientEvent", event);
  }

  evalString(code: string) {
    return this.dom.evalString(code);
  }

  postWorkerMessage(message: unknown): void {
    this.worker.postMessage(message as any);
  }

  terminate(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.dom.terminate();
  }

  private async sendSnapshot(force: boolean): Promise<void> {
    if (!force && this.snapshotSent) {
      return this.snapshotInFlight ?? Promise.resolve();
    }
    if (this.snapshotInFlight) {
      return this.snapshotInFlight;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (!force) {
      this.snapshotSent = true;
    }
    this.snapshotInFlight = (async () => {
      const snapshot = await this.dom.getSnapshot();
      this.ws?.send(JSON.stringify(snapshot));
    })().finally(() => {
      this.snapshotInFlight = null;
    });
    return this.snapshotInFlight;
  }

  private flush() {
    if (this.batch.instructions.length === 0 || !this.ws) {
      return;
    }
    const instr = this.batch.instructions.slice();
    this.batch.instructions = [];
    this.ws.send(
      JSON.stringify({
        type: "instructions",
        instructions: instr,
      } as InstructionMessage)
    );
  }

  private handleMessage(buffer: Buffer) {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === "ready") {
      if (this.clientReady) {
        void this.sendSnapshot(false);
        return;
      }
      this.clientReady = true;
      this.pending.splice(0, this.pending.length);
      void this.sendSnapshot(false);
    } else if (message.type === "resync") {
      void this.sendSnapshot(true);
    } else if (message.type === "event") {
      this.dispatchEvent(message.event);
    }
  }
}
