import type { EventMessage, Message } from "../core/protocol/messages";
import { NodeStash } from "../core/model/nodes";
import { debounce } from "../shared-utils";
import { serializeEvent } from "./events";
import * as Instr from "../core/ops/instructions";
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
        this.readyInterval = window.setInterval(() => {
          if (this.state.snapshotApplied) {
            if (this.readyInterval !== null) {
              clearInterval(this.readyInterval);
              this.readyInterval = null;
            }
            return;
          }
          this.sendReady();
        }, 250);
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

  private sendPayload(payload: unknown) {
    if (!this.transport || !this.transport.isOpen()) {
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
    const jitter = baseDelay * this.reconnect.jitterRatio * (Math.random() * 2 - 1);
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
    if (message.type === "snapshot") {
      this.state.snapshotApplied = true;
      const applyAttributes = (
        element: Element | null,
        attributes: [string, string][]
      ) => {
        if (!element) {
          return;
        }
        for (const [name, value] of attributes) {
          element.setAttribute(name, value);
        }
      };
      applyAttributes(document.documentElement, message.htmlAttributes);
      applyAttributes(document.head, message.headAttributes);
      applyAttributes(document.body, message.bodyAttributes);
      if (document.head) {
        document.head.innerHTML = message.headHtml;
      }
      if (document.body) {
        document.body.innerHTML = message.bodyHtml;
      }
    } else if (message.type === "instructions") {
      for (const instruction of message.instructions) {
        const [type] = instruction;
        switch (type) {
          case Instr.InstructionType.CreateElement:
            Instr.CreateElement.apply(
              { window, nodes: this.nodes },
              Instr.CreateElement.deserialize(
                instruction as Instr.CreateElement.Serialized
              )
            );
            break;
          case Instr.InstructionType.SetAttribute:
            Instr.SetAttribute.apply(
              { window, nodes: this.nodes },
              Instr.SetAttribute.deserialize(
                instruction as Instr.SetAttribute.Serialized
              )
            );
            break;
          case Instr.InstructionType.SetProperty:
            Instr.SetProperty.apply(
              { window, nodes: this.nodes },
              Instr.SetProperty.deserialize(
                instruction as Instr.SetProperty.Serialized
              )
            );
            break;
          case Instr.InstructionType.AppendChild:
            Instr.AppendChild.apply(
              { window, nodes: this.nodes },
              Instr.AppendChild.deserialize(
                instruction as Instr.AppendChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.CreateDocumentFragment:
            Instr.CreateDocumentFragment.apply(
              { window, nodes: this.nodes },
              Instr.CreateDocumentFragment.deserialize(
                instruction as Instr.CreateDocumentFragment.Serialized
              )
            );
            break;
          case Instr.InstructionType.CreateTextNode:
            Instr.CreateTextNode.apply(
              { window, nodes: this.nodes },
              Instr.CreateTextNode.deserialize(
                instruction as Instr.CreateTextNode.Serialized
              )
            );
            break;
          case Instr.InstructionType.RemoveChild:
            Instr.RemoveChild.apply(
              { window, nodes: this.nodes },
              Instr.RemoveChild.deserialize(
                instruction as Instr.RemoveChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.CloneNode:
            Instr.CloneNode.apply(
              { window, nodes: this.nodes },
              Instr.CloneNode.deserialize(
                instruction as Instr.CloneNode.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertAdjacentElement:
            Instr.InsertAdjacentElement.apply(
              { window, nodes: this.nodes },
              Instr.InsertAdjacentElement.deserialize(
                instruction as Instr.InsertAdjacentElement.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertAdjacentHTML:
            Instr.InsertAdjacentHTML.apply(
              { window, nodes: this.nodes },
              Instr.InsertAdjacentHTML.deserialize(
                instruction as Instr.InsertAdjacentHTML.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertAdjacentText:
            Instr.InsertAdjacentText.apply(
              { window, nodes: this.nodes },
              Instr.InsertAdjacentText.deserialize(
                instruction as Instr.InsertAdjacentText.Serialized
              )
            );
            break;
          case Instr.InstructionType.PrependChild:
            Instr.PrependChild.apply(
              { window, nodes: this.nodes },
              Instr.PrependChild.deserialize(
                instruction as Instr.PrependChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.Normalize:
            Instr.Normalize.apply(
              { window, nodes: this.nodes },
              Instr.Normalize.deserialize(
                instruction as Instr.Normalize.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertBefore:
            Instr.InsertBefore.apply(
              { window, nodes: this.nodes },
              Instr.InsertBefore.deserialize(
                instruction as Instr.InsertBefore.Serialized
              )
            );
            break;
          case Instr.InstructionType.ReplaceChild:
            Instr.ReplaceChild.apply(
              { window, nodes: this.nodes },
              Instr.ReplaceChild.deserialize(
                instruction as Instr.ReplaceChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.RemoveAttribute:
            Instr.RemoveAttribute.apply(
              { window, nodes: this.nodes },
              Instr.RemoveAttribute.deserialize(
                instruction as Instr.RemoveAttribute.Serialized
              )
            );
            break;
        }
      }
    } else if (message.type === "error") {
      console.error(message.error, message.errorInfo);
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
