import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import { WebSocket } from "ws";
import type { SerializedEvent } from "./core/protocol/events";
import { createDom } from "./dom";
import { type Serialized } from "./core/ops/instructions";
import type { InstructionMessage, Message } from "./core/protocol/messages";

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
} from "./core/protocol/events";
export { getXPath } from "./shared-utils";

export type WebsocketDomEvents = {
  clientEvent: (event: SerializedEvent) => void;
};

export type WebsocketDomOptions = {
  htmlDocument: string;
  url: string;
};

type ConnectionState = {
  ws: WebSocket;
  clientReady: boolean;
  snapshotSent: boolean;
  snapshotInFlight: Promise<void> | null;
  pending: Serialized[];
  batch: Serialized[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  messageHandler: (buffer: Buffer) => void;
  closeHandler: () => void;
};

export class WebsocketDOM {
  private readonly dom: ReturnType<typeof createDom>;
  private readonly publicEmitter: TypedEmitter<WebsocketDomEvents>;
  private readonly connections = new Map<WebSocket, ConnectionState>();

  public readonly worker: ReturnType<typeof createDom>["worker"];

  constructor(options: WebsocketDomOptions) {
    const { htmlDocument, url } = options;
    this.dom = createDom(htmlDocument, { url });
    this.worker = this.dom.worker;
    this.publicEmitter = new EventEmitter() as TypedEmitter<WebsocketDomEvents>;

    this.dom.emitter.on("instruction", (instruction: Serialized) => {
      for (const connection of this.connections.values()) {
        if (!connection.clientReady) {
          connection.pending.push(instruction);
          continue;
        }
        connection.batch.push(instruction);
        if (connection.flushTimer === null) {
          connection.flushTimer = setTimeout(() => this.flush(connection), 0);
        }
      }
    });
  }

  get emitter() {
    return this.publicEmitter;
  }

  isConnected() {
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  addConnection(ws: WebSocket) {
    if (this.connections.has(ws)) {
      return;
    }
    const connection: ConnectionState = {
      ws,
      clientReady: false,
      snapshotSent: false,
      snapshotInFlight: null,
      pending: [],
      batch: [],
      flushTimer: null,
      messageHandler: (buffer: Buffer) => {
        this.handleMessage(connection, buffer);
      },
      closeHandler: () => {
        this.removeConnection(ws);
      },
    };

    ws.on("message", connection.messageHandler);
    ws.on("close", connection.closeHandler);
    this.connections.set(ws, connection);
  }

  removeConnection(ws: WebSocket) {
    const connection = this.connections.get(ws);
    if (!connection) {
      return;
    }
    ws.off("message", connection.messageHandler);
    ws.off("close", connection.closeHandler);
    if (connection.flushTimer !== null) {
      clearTimeout(connection.flushTimer);
    }
    this.connections.delete(ws);
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
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
      if (connection.flushTimer !== null) {
        clearTimeout(connection.flushTimer);
      }
    }
    this.connections.clear();
    this.dom.terminate();
  }

  private async sendSnapshot(
    connection: ConnectionState,
    force: boolean
  ): Promise<void> {
    if (!force && connection.snapshotSent) {
      return connection.snapshotInFlight ?? Promise.resolve();
    }
    if (connection.snapshotInFlight) {
      return connection.snapshotInFlight;
    }
    if (connection.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (!force) {
      connection.snapshotSent = true;
    }
    connection.snapshotInFlight = (async () => {
      const snapshot = await this.dom.getSnapshot();
      connection.ws.send(JSON.stringify(snapshot));
    })().finally(() => {
      connection.snapshotInFlight = null;
    });
    return connection.snapshotInFlight;
  }

  private flush(connection: ConnectionState) {
    connection.flushTimer = null;
    if (connection.batch.length === 0) {
      return;
    }
    if (connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const instr = connection.batch.slice();
    connection.batch = [];
    connection.ws.send(
      JSON.stringify({
        type: "instructions",
        instructions: instr,
      } as InstructionMessage)
    );
  }

  private handleMessage(connection: ConnectionState, buffer: Buffer) {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === "ready") {
      if (connection.clientReady) {
        void this.sendSnapshot(connection, false);
        return;
      }
      connection.clientReady = true;
      connection.pending.splice(0, connection.pending.length);
      void this.sendSnapshot(connection, false);
    } else if (message.type === "resync") {
      void this.sendSnapshot(connection, true);
    } else if (message.type === "event") {
      this.dispatchEvent(message.event);
    }
  }
}
