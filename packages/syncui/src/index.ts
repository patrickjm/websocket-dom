import EventEmitter from "events";
import type TypedEmitter from "typed-emitter";
import type { SerializedEvent } from "./core/protocol/events";
import { createDom } from "./dom";
import { type Serialized } from "./core/ops/instructions";
import type { InstructionMessage, Message } from "./core/protocol/messages";
import type { UiAdapter, UiAdapterFactory } from "./core/adapter/types";
import type { TransportConnection } from "./core/transport/types";

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
export type { UiAdapter, UiAdapterFactory } from "./core/adapter/types";
export type { TransportConnection } from "./core/transport/types";
export { getXPath } from "./shared-utils";
export { createWebSocketServerTransport } from "./transport/ws-server";

export type WebsocketDomEvents = {
  clientEvent: (event: SerializedEvent) => void;
};

export type WebsocketDomOptions = {
  htmlDocument: string;
  url: string;
  adapter?: UiAdapterFactory;
};

type ConnectionState = {
  transport: TransportConnection;
  clientReady: boolean;
  snapshotSent: boolean;
  snapshotInFlight: Promise<void> | null;
  pending: Serialized[];
  batch: Serialized[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  messageUnsubscribe: () => void;
  closeUnsubscribe: () => void;
};

export class WebsocketDOM {
  private readonly dom: UiAdapter;
  private readonly publicEmitter: TypedEmitter<WebsocketDomEvents>;
  private readonly connections = new Map<
    TransportConnection,
    ConnectionState
  >();

  public readonly worker: UiAdapter["worker"];

  constructor(options: WebsocketDomOptions) {
    const { htmlDocument, url, adapter } = options;
    this.dom = adapter
      ? adapter(htmlDocument, { url })
      : createDom(htmlDocument, { url });
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
      if (connection.transport.isOpen()) {
        return true;
      }
    }
    return false;
  }

  addConnection(transport: TransportConnection) {
    if (this.connections.has(transport)) {
      return;
    }
    const connection: ConnectionState = {
      transport,
      clientReady: false,
      snapshotSent: false,
      snapshotInFlight: null,
      pending: [],
      batch: [],
      flushTimer: null,
      messageUnsubscribe: transport.onMessage((data) => {
        this.handleMessage(connection, data);
      }),
      closeUnsubscribe: transport.onClose(() => {
        this.removeConnection(transport);
      }),
    };

    this.connections.set(transport, connection);
  }

  removeConnection(transport: TransportConnection) {
    const connection = this.connections.get(transport);
    if (!connection) {
      return;
    }
    connection.messageUnsubscribe();
    connection.closeUnsubscribe();
    if (connection.flushTimer !== null) {
      clearTimeout(connection.flushTimer);
    }
    this.connections.delete(transport);
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
    if (!this.worker) {
      throw new Error("No worker is available for this adapter.");
    }
    this.worker.postMessage(message as any);
  }

  terminate(): void {
    for (const connection of this.connections.values()) {
      if (connection.transport.isOpen()) {
        connection.transport.close();
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
    if (!connection.transport.isOpen()) {
      return Promise.resolve();
    }
    if (!force) {
      connection.snapshotSent = true;
    }
    connection.snapshotInFlight = (async () => {
      const snapshot = await this.dom.getSnapshot();
      connection.transport.send(JSON.stringify(snapshot));
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
    if (!connection.transport.isOpen()) {
      return;
    }
    const instr = connection.batch.slice();
    connection.batch = [];
    connection.transport.send(
      JSON.stringify({
        type: "instructions",
        instructions: instr,
      } as InstructionMessage)
    );
  }

  private handleMessage(connection: ConnectionState, data: string) {
    const message = JSON.parse(data) as Message;
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
