import EventEmitter from "node:events";
import type TypedEmitter from "typed-emitter";
import type { SerializedEvent } from "./core/protocol/events";
import type { Serialized } from "./core/ops/instructions";
import type {
  InstructionMessage,
  Message,
  SnapshotMessage,
} from "./core/protocol/messages";
import type { UiAdapter, UiAdapterFactory } from "./core/adapter/types";
import type { TransportConnection } from "./core/transport/types";
import type { AssetProxy, AssetProxyConfig } from "./asset-proxy";
import { createAssetProxy } from "./asset-proxy";
import { InstructionType } from "./core/ops/instructions";

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
export { createWebSocketClientTransport } from "./transport/ws-client";

export type SyncUISessionEvents = {
  clientEvent: (event: SerializedEvent) => void;
};

export type SyncUISessionOptions = {
  htmlDocument: string;
  url: string;
  adapter?: UiAdapterFactory;
  sessionId?: string;
  assetProxy?: Omit<AssetProxyConfig, "sessionId">;
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

export class SyncUISession {
  private readonly dom: UiAdapter;
  private readonly publicEmitter: TypedEmitter<SyncUISessionEvents>;
  private readonly connections = new Map<
    TransportConnection,
    ConnectionState
  >();
  private assetProxy: AssetProxy | null = null;

  public readonly sessionId: string;

  public readonly worker: UiAdapter["worker"];

  constructor(options: SyncUISessionOptions) {
    const { htmlDocument, url, adapter } = options;
    if (!adapter) {
      throw new Error(
        "SyncUISession requires an adapter. Install syncui-dom and pass adapter."
      );
    }
    this.sessionId = options.sessionId ?? "default";
    this.dom = adapter(htmlDocument, { url });
    this.worker = this.dom.worker;
    this.publicEmitter =
      new EventEmitter() as TypedEmitter<SyncUISessionEvents>;
    if (options.assetProxy) {
      this.enableAssetProxy(options.assetProxy);
    }

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

  navigate(url: string) {
    return this.handleNavigate(url);
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

  enableAssetProxy(config: Omit<AssetProxyConfig, "sessionId">): AssetProxy {
    this.assetProxy = createAssetProxy({
      ...config,
      sessionId: this.sessionId,
    });
    return this.assetProxy;
  }

  getAssetProxy() {
    return this.assetProxy;
  }

  getAssetProxyUrl(url: string, opts?: { expiresAtMs?: number }) {
    return this.assetProxy?.getProxyUrl(url, opts) ?? null;
  }

  setAssetProxyBaseUrl(baseUrl: string) {
    this.assetProxy?.setBaseUrl(baseUrl);
  }

  assetProxyHandler() {
    if (!this.assetProxy) {
      throw new Error("Asset proxy is not enabled for this session.");
    }
    return this.assetProxy.handler;
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
    this.worker.postMessage(message);
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
    const gate = this.getSnapshotGate(connection, force);
    if (gate) {
      return gate;
    }
    connection.snapshotInFlight = this.sendSnapshotPayload(
      connection,
      force
    ).finally(() => {
      connection.snapshotInFlight = null;
    });
    return connection.snapshotInFlight;
  }

  private getSnapshotGate(
    connection: ConnectionState,
    force: boolean
  ): Promise<void> | null {
    if (!force && connection.snapshotSent) {
      return connection.snapshotInFlight ?? Promise.resolve();
    }
    if (connection.snapshotInFlight) {
      return connection.snapshotInFlight;
    }
    if (!connection.transport.isOpen()) {
      return Promise.resolve();
    }
    return null;
  }

  private async sendSnapshotPayload(
    connection: ConnectionState,
    force: boolean
  ): Promise<void> {
    const snapshot = await this.dom.getSnapshot();
    const payload = this.assetProxy ? this.rewriteSnapshot(snapshot) : snapshot;
    if (!connection.transport.isOpen()) {
      return;
    }
    this.trySendSnapshot(connection, payload, force);
  }

  private trySendSnapshot(
    connection: ConnectionState,
    payload: SnapshotMessage,
    force: boolean
  ) {
    try {
      connection.transport.send(JSON.stringify(payload));
      if (!force) {
        connection.snapshotSent = true;
      }
    } catch {
      if (!force) {
        connection.snapshotSent = false;
      }
    }
  }

  private flush(connection: ConnectionState) {
    connection.flushTimer = null;
    if (connection.batch.length === 0) {
      return;
    }
    if (!connection.transport.isOpen()) {
      return;
    }
    const instr = this.assetProxy
      ? connection.batch.map((instruction) =>
          this.rewriteInstruction(instruction)
        )
      : connection.batch.slice();
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
    } else if (message.type === "navigate") {
      void this.handleNavigate(message.url);
    }
  }

  private async handleNavigate(url: string) {
    if (this.assetProxy) {
      this.assetProxy.setBaseUrl(url);
    }
    if (this.worker) {
      this.postWorkerMessage({ type: "navigate", url });
    } else {
      const code = `
        new Promise((resolve) => {
          let resolved = false;
          const done = () => {
            if (resolved) {
              return;
            }
            resolved = true;
            resolve(undefined);
          };
          const detail = { url: ${JSON.stringify(url)}, resolve: done };
          document.dispatchEvent(new CustomEvent("syncui:navigate", { detail }));
          setTimeout(done, 5000);
        });
      `;
      await this.dom.evalString(code);
    }
    for (const connection of this.connections.values()) {
      void this.sendSnapshot(connection, true);
    }
  }

  private rewriteSnapshot(snapshot: SnapshotMessage) {
    if (!this.assetProxy) {
      return snapshot;
    }
    const rewriteAttributes = (attrs: [string, string][]) => {
      return attrs.map(([name, value]) => [
        name,
        this.rewriteAttributeValue(name, value),
      ]) as [string, string][];
    };
    return {
      ...snapshot,
      htmlAttributes: rewriteAttributes(snapshot.htmlAttributes),
      headAttributes: rewriteAttributes(snapshot.headAttributes),
      bodyAttributes: rewriteAttributes(snapshot.bodyAttributes),
      headHtml: this.assetProxy.rewriteHtml(snapshot.headHtml),
      bodyHtml: this.assetProxy.rewriteHtml(snapshot.bodyHtml),
    };
  }

  private rewriteInstruction(instruction: Serialized): Serialized {
    if (!this.assetProxy) {
      return instruction;
    }
    const type = instruction[0] as InstructionType;
    if (type === InstructionType.SetAttribute) {
      const name = instruction[2] as string;
      const value = instruction[3] as string;
      const nextValue = this.rewriteAttributeValue(name, value);
      return [instruction[0], instruction[1], name, nextValue] as Serialized;
    }
    if (type === InstructionType.SetProperty) {
      const name = instruction[2] as string;
      const value = instruction[3] as string;
      const nextValue = this.rewritePropertyValue(name, value);
      return [instruction[0], instruction[1], name, nextValue] as Serialized;
    }
    if (type === InstructionType.InsertAdjacentHTML) {
      const html = instruction[3] as string;
      const nextHtml = this.assetProxy.rewriteHtml(html);
      return [
        instruction[0],
        instruction[1],
        instruction[2],
        nextHtml,
      ] as Serialized;
    }
    return instruction;
  }

  private rewritePropertyValue(name: string, value: string) {
    if (!this.assetProxy) {
      return value;
    }
    const lower = name.toLowerCase();
    if (lower === "innerhtml" || lower === "outerhtml") {
      return this.assetProxy.rewriteHtml(value);
    }
    if (lower === "style" || lower === "csstext") {
      return this.assetProxy.rewriteCss(value);
    }
    if (lower === "src" || lower === "href") {
      return this.assetProxy.getProxyUrl(value) ?? value;
    }
    return value;
  }

  private rewriteAttributeValue(name: string, value: string) {
    if (!this.assetProxy) {
      return value;
    }
    const lower = name.toLowerCase();
    if (lower === "style") {
      return this.assetProxy.rewriteCss(value);
    }
    if (lower === "srcset") {
      return this.rewriteSrcSet(value);
    }
    if (
      [
        "href",
        "src",
        "action",
        "formaction",
        "poster",
        "data",
        "xlink:href",
      ].includes(lower)
    ) {
      return this.assetProxy.getProxyUrl(value) ?? value;
    }
    return value;
  }

  private rewriteSrcSet(value: string) {
    if (!this.assetProxy) {
      return value;
    }
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts
      .map((part) => {
        const [rawUrl, ...rest] = part.split(/\s+/);
        if (!rawUrl) {
          return part;
        }
        const rewritten = this.assetProxy?.getProxyUrl(rawUrl);
        if (!rewritten) {
          return part;
        }
        return [rewritten, ...rest].join(" ");
      })
      .join(", ");
  }
}
