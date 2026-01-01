import type { EventMessage, Message } from "../core/protocol/messages";
import { NodeStash } from "../core/model/nodes";
import { debounce } from "../shared-utils";
import { serializeEvent } from "./events";
import {
  AppendChild,
  CloneNode,
  CreateDocumentFragment,
  CreateElement,
  CreateTextNode,
  InsertAdjacentElement,
  InsertAdjacentHTML,
  InsertAdjacentText,
  InsertBefore,
  InstructionType,
  Normalize,
  PrependChild,
  RemoveAttribute,
  RemoveChild,
  ReplaceChild,
  SetAttribute,
  SetProperty,
  type Serialized as InstructionSerialized,
} from "../core/ops/instructions";
import type { TransportConnection } from "../core/transport/types";
import { createWebSocketClientTransport } from "../transport/ws-client";

export type ReconnectOptions = {
  enabled?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
};

export type ClientOptions = {
  reconnect?: ReconnectOptions;
};

export type SyncUIClientState = {
  snapshotApplied: boolean;
  lastMessageType: string;
  pendingResync: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
};

export class SyncUIClient {
  public transport: TransportConnection | null = null;
  public readonly state: SyncUIClientState = {
    snapshotApplied: false,
    lastMessageType: "",
    pendingResync: false,
    reconnecting: false,
    reconnectAttempts: 0,
  };

  private readonly url: string;
  private readonly reconnect: Required<ReconnectOptions>;
  private readonly nodes: NodeStash;
  private readyInterval: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private manuallyClosed = false;
  private connectedOnce = false;

  constructor(url: string, options: ClientOptions = {}) {
    this.url = url;
    this.reconnect = {
      enabled: options.reconnect?.enabled ?? true,
      maxAttempts: options.reconnect?.maxAttempts ?? Number.POSITIVE_INFINITY,
      baseDelayMs: options.reconnect?.baseDelayMs ?? 500,
      maxDelayMs: options.reconnect?.maxDelayMs ?? 10_000,
      jitterRatio: options.reconnect?.jitterRatio ?? 0.2,
    };
    this.nodes = new NodeStash(window);
    this.installEventListeners();
  }

  connect() {
    if (this.manuallyClosed) {
      return;
    }
    this.state.snapshotApplied = false;
    const nextTransport = createWebSocketClientTransport(this.url);
    this.transport = nextTransport;
    const messageUnsub = nextTransport.onMessage((data) => {
      this.handleMessage(data);
    });
    let closeUnsub: (() => void) | null = null;

    nextTransport.onOpen?.(() => {
      this.reconnectAttempts = 0;
      this.state.reconnectAttempts = 0;
      this.state.reconnecting = false;
      this.sendReady();
      if (this.readyInterval === null) {
        this.readyInterval = window.setInterval(
          () => this.handleReadyIntervalTick(),
          250
        );
      }
      if (this.connectedOnce || this.state.pendingResync) {
        this.state.pendingResync = false;
        this.sendPayload({ type: "resync" });
      }
      this.connectedOnce = true;
    });
    nextTransport.onError?.((error) => {
      console.error("WebSocket error:", error);
    });
    closeUnsub = nextTransport.onClose(() => {
      messageUnsub();
      closeUnsub?.();
      closeUnsub = null;
      if (this.readyInterval !== null) {
        clearInterval(this.readyInterval);
        this.readyInterval = null;
      }
      this.scheduleReconnect();
    });
  }

  close() {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.readyInterval !== null) {
      clearInterval(this.readyInterval);
      this.readyInterval = null;
    }
    this.transport?.close();
  }

  resync(): void {
    if (!this.sendPayload({ type: "resync" })) {
      this.state.pendingResync = true;
    }
  }

  navigate(url: string): boolean {
    return this.sendPayload({ type: "navigate", url });
  }

  private sendPayload(payload: unknown) {
    if (!this.transport?.isOpen()) {
      return false;
    }
    this.transport.send(JSON.stringify(payload));
    return true;
  }

  private sendReady() {
    this.sendPayload({ type: "ready" });
  }

  private scheduleReconnect() {
    if (!this.reconnect.enabled || this.manuallyClosed) {
      return;
    }
    if (this.reconnectTimer !== null) {
      return;
    }
    if (this.reconnectAttempts >= this.reconnect.maxAttempts) {
      return;
    }
    const baseDelay = Math.min(
      this.reconnect.baseDelayMs * 2 ** this.reconnectAttempts,
      this.reconnect.maxDelayMs
    );
    const jitter =
      baseDelay * this.reconnect.jitterRatio * (Math.random() * 2 - 1);
    const delay = Math.max(0, baseDelay + jitter);
    this.reconnectAttempts += 1;
    this.state.reconnectAttempts = this.reconnectAttempts;
    this.state.reconnecting = true;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(data: string) {
    const message = JSON.parse(data) as Message;
    this.state.lastMessageType = message.type;
    switch (message.type) {
      case "snapshot":
        this.applySnapshot(message);
        break;
      case "instructions":
        this.applyInstructions(message.instructions);
        break;
      case "error":
        console.error(message.error, message.errorInfo);
        break;
    }
  }

  private handleReadyIntervalTick() {
    if (this.state.snapshotApplied) {
      if (this.readyInterval !== null) {
        clearInterval(this.readyInterval);
        this.readyInterval = null;
      }
      return;
    }
    this.sendReady();
  }

  private applySnapshot(message: Message & { type: "snapshot" }) {
    this.state.snapshotApplied = true;
    this.applyAttributes(document.documentElement, message.htmlAttributes);
    this.applyAttributes(document.head, message.headAttributes);
    this.applyAttributes(document.body, message.bodyAttributes);
    if (document.head) {
      document.head.innerHTML = message.headHtml;
    }
    if (document.body) {
      document.body.innerHTML = message.bodyHtml;
    }
  }

  private applyAttributes(
    element: Element | null,
    attributes: [string, string][]
  ) {
    if (!element) {
      return;
    }
    for (const [name, value] of attributes) {
      element.setAttribute(name, value);
    }
  }

  private applyInstructions(instructions: readonly InstructionSerialized[]) {
    for (const instruction of instructions) {
      this.applyInstruction(instruction);
    }
  }

  private applyInstruction(instruction: InstructionSerialized) {
    const [type] = instruction;
    switch (type) {
      case InstructionType.CreateElement:
        CreateElement.apply(
          { window, nodes: this.nodes },
          CreateElement.deserialize(instruction as CreateElement.Serialized)
        );
        break;
      case InstructionType.SetAttribute:
        SetAttribute.apply(
          { window, nodes: this.nodes },
          SetAttribute.deserialize(instruction as SetAttribute.Serialized)
        );
        break;
      case InstructionType.SetProperty:
        SetProperty.apply(
          { window, nodes: this.nodes },
          SetProperty.deserialize(instruction as SetProperty.Serialized)
        );
        break;
      case InstructionType.AppendChild:
        AppendChild.apply(
          { window, nodes: this.nodes },
          AppendChild.deserialize(instruction as AppendChild.Serialized)
        );
        break;
      case InstructionType.CreateDocumentFragment:
        CreateDocumentFragment.apply(
          { window, nodes: this.nodes },
          CreateDocumentFragment.deserialize(
            instruction as CreateDocumentFragment.Serialized
          )
        );
        break;
      case InstructionType.CreateTextNode:
        CreateTextNode.apply(
          { window, nodes: this.nodes },
          CreateTextNode.deserialize(instruction as CreateTextNode.Serialized)
        );
        break;
      case InstructionType.RemoveChild:
        RemoveChild.apply(
          { window, nodes: this.nodes },
          RemoveChild.deserialize(instruction as RemoveChild.Serialized)
        );
        break;
      case InstructionType.CloneNode:
        CloneNode.apply(
          { window, nodes: this.nodes },
          CloneNode.deserialize(instruction as CloneNode.Serialized)
        );
        break;
      case InstructionType.InsertAdjacentElement:
        InsertAdjacentElement.apply(
          { window, nodes: this.nodes },
          InsertAdjacentElement.deserialize(
            instruction as InsertAdjacentElement.Serialized
          )
        );
        break;
      case InstructionType.InsertAdjacentHTML:
        InsertAdjacentHTML.apply(
          { window, nodes: this.nodes },
          InsertAdjacentHTML.deserialize(
            instruction as InsertAdjacentHTML.Serialized
          )
        );
        break;
      case InstructionType.InsertAdjacentText:
        InsertAdjacentText.apply(
          { window, nodes: this.nodes },
          InsertAdjacentText.deserialize(
            instruction as InsertAdjacentText.Serialized
          )
        );
        break;
      case InstructionType.PrependChild:
        PrependChild.apply(
          { window, nodes: this.nodes },
          PrependChild.deserialize(instruction as PrependChild.Serialized)
        );
        break;
      case InstructionType.Normalize:
        Normalize.apply(
          { window, nodes: this.nodes },
          Normalize.deserialize(instruction as Normalize.Serialized)
        );
        break;
      case InstructionType.InsertBefore:
        InsertBefore.apply(
          { window, nodes: this.nodes },
          InsertBefore.deserialize(instruction as InsertBefore.Serialized)
        );
        break;
      case InstructionType.ReplaceChild:
        ReplaceChild.apply(
          { window, nodes: this.nodes },
          ReplaceChild.deserialize(instruction as ReplaceChild.Serialized)
        );
        break;
      case InstructionType.RemoveAttribute:
        RemoveAttribute.apply(
          { window, nodes: this.nodes },
          RemoveAttribute.deserialize(instruction as RemoveAttribute.Serialized)
        );
        break;
    }
  }

  private sendEvent(event: Event, overrideType?: string): void {
    const serializedEvent = serializeEvent(event);
    const payload = overrideType
      ? { ...serializedEvent, type: overrideType }
      : serializedEvent;
    this.sendPayload({
      type: "event",
      event: payload,
    } as EventMessage);
  }

  private installEventListeners() {
    const eventTypes = [
      "click",
      "mousedown",
      "mouseup",
      "dblclick",
      "contextmenu",
      "keydown",
      "keypress",
      "keyup",
      "input",
      "change",
      "submit",
      "focus",
      "blur",
      "focusin",
      "focusout",
      "dragstart",
      "drag",
      "dragend",
      "dragenter",
      "dragover",
      "dragleave",
      "drop",
      "pointerdown",
      "pointerup",
      "pointermove",
      "pointerenter",
      "pointerleave",
      "pointerover",
      "pointerout",
      "pointercancel",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "copy",
      "cut",
      "paste",
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "beforeinput",
      "selectionchange",
      "reset",
      "invalid",
      "wheel",
      "scroll",
    ];
    for (const eventType of eventTypes) {
      document.addEventListener(
        eventType,
        (event) => {
          this.sendEvent(event);
        },
        true
      );
    }
    document.addEventListener(
      "pointermove",
      (event) => {
        if (event instanceof PointerEvent && event.pointerType === "mouse") {
          this.sendEvent(event, "mousemove");
        }
      },
      true
    );

    const debouncedSendMouseEvent = debounce((event: Event) => {
      this.sendEvent(event);
    }, 250);
    const mouseEventTypes = ["mouseover", "mouseout", "mousemove"];
    for (const eventType of mouseEventTypes) {
      const handler =
        eventType === "mousemove"
          ? debouncedSendMouseEvent
          : (event: Event) => {
              this.sendEvent(event);
            };
      document.addEventListener(eventType, handler as EventListener, true);
    }
    document.addEventListener(
      "mouseover",
      (event) => {
        this.sendEvent(event, "mouseenter");
      },
      true
    );
    document.addEventListener(
      "mouseout",
      (event) => {
        this.sendEvent(event, "mouseleave");
      },
      true
    );

    window.addEventListener("resize", (event) => {
      this.sendEvent(event);
    });
    window.addEventListener(
      "scroll",
      (event) => {
        this.sendEvent(event);
      },
      true
    );
  }
}
