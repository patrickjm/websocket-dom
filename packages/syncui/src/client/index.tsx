import type { EventMessage, Message } from "../core/protocol/messages";
import { NodeStash } from "../core/model/nodes";
import { debounce } from "../shared-utils";
import { serializeEvent } from "./events";
import * as Instr from "../core/ops/instructions";
import type { TransportConnection } from "../core/transport/types";
import { createWebSocketClientTransport } from "../transport/ws-client";

/**
 * Creates a client that connects to a syncui server and starts the sync.
 * @param uri The URI to connect to, e.g. ws://localhost:3000
 */
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

export type WebsocketDomClient = {
  transport: TransportConnection | null;
  state: {
    snapshotApplied: boolean;
    lastMessageType: string;
    pendingResync: boolean;
    reconnecting: boolean;
    reconnectAttempts: number;
  };
  resync: () => void;
  close: () => void;
  connect: () => void;
};

export function createClient(
  url: string,
  options: ClientOptions = {}
): WebsocketDomClient {
  const reconnect = {
    enabled: options.reconnect?.enabled ?? true,
    maxAttempts: options.reconnect?.maxAttempts ?? Infinity,
    baseDelayMs: options.reconnect?.baseDelayMs ?? 500,
    maxDelayMs: options.reconnect?.maxDelayMs ?? 10_000,
    jitterRatio: options.reconnect?.jitterRatio ?? 0.2,
  };
  let transport: TransportConnection | null = null;
  const nodes = new NodeStash(window);
  console.log("nodes", nodes);
  let readyInterval: number | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempts = 0;
  let manuallyClosed = false;
  let connectedOnce = false;
  const state = {
    snapshotApplied: false,
    lastMessageType: "",
    pendingResync: false,
    reconnecting: false,
    reconnectAttempts: 0,
  };

  const sendPayload = (payload: unknown) => {
    if (!transport || !transport.isOpen()) {
      return false;
    }
    transport.send(JSON.stringify(payload));
    return true;
  };

  const sendReady = () => {
    sendPayload({ type: "ready" });
  };

  const scheduleReconnect = () => {
    if (!reconnect.enabled || manuallyClosed) {
      return;
    }
    if (reconnectTimer !== null) {
      return;
    }
    if (reconnectAttempts >= reconnect.maxAttempts) {
      return;
    }
    const baseDelay = Math.min(
      reconnect.baseDelayMs * 2 ** reconnectAttempts,
      reconnect.maxDelayMs
    );
    const jitter = baseDelay * reconnect.jitterRatio * (Math.random() * 2 - 1);
    const delay = Math.max(0, baseDelay + jitter);
    reconnectAttempts += 1;
    state.reconnectAttempts = reconnectAttempts;
    state.reconnecting = true;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const handleMessage = (data: string) => {
    const message = JSON.parse(data) as Message;
    state.lastMessageType = message.type;
    if (message.type === "snapshot") {
      state.snapshotApplied = true;
      const applyAttributes = (
        element: Element | null,
        attributes: [string, string][]
      ) => {
        if (!element) {
          return;
        }
        attributes.forEach(([name, value]) => {
          element.setAttribute(name, value);
        });
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
              { window, nodes },
              Instr.CreateElement.deserialize(
                instruction as Instr.CreateElement.Serialized
              )
            );
            break;
          case Instr.InstructionType.SetAttribute:
            Instr.SetAttribute.apply(
              { window, nodes },
              Instr.SetAttribute.deserialize(
                instruction as Instr.SetAttribute.Serialized
              )
            );
            break;
          case Instr.InstructionType.SetProperty:
            Instr.SetProperty.apply(
              { window, nodes },
              Instr.SetProperty.deserialize(
                instruction as Instr.SetProperty.Serialized
              )
            );
            break;
          case Instr.InstructionType.AppendChild:
            Instr.AppendChild.apply(
              { window, nodes },
              Instr.AppendChild.deserialize(
                instruction as Instr.AppendChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.CreateDocumentFragment:
            Instr.CreateDocumentFragment.apply(
              { window, nodes },
              Instr.CreateDocumentFragment.deserialize(
                instruction as Instr.CreateDocumentFragment.Serialized
              )
            );
            break;
          case Instr.InstructionType.CreateTextNode:
            Instr.CreateTextNode.apply(
              { window, nodes },
              Instr.CreateTextNode.deserialize(
                instruction as Instr.CreateTextNode.Serialized
              )
            );
            break;
          case Instr.InstructionType.RemoveChild:
            Instr.RemoveChild.apply(
              { window, nodes },
              Instr.RemoveChild.deserialize(
                instruction as Instr.RemoveChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.CloneNode:
            Instr.CloneNode.apply(
              { window, nodes },
              Instr.CloneNode.deserialize(
                instruction as Instr.CloneNode.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertAdjacentElement:
            Instr.InsertAdjacentElement.apply(
              { window, nodes },
              Instr.InsertAdjacentElement.deserialize(
                instruction as Instr.InsertAdjacentElement.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertAdjacentHTML:
            Instr.InsertAdjacentHTML.apply(
              { window, nodes },
              Instr.InsertAdjacentHTML.deserialize(
                instruction as Instr.InsertAdjacentHTML.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertAdjacentText:
            Instr.InsertAdjacentText.apply(
              { window, nodes },
              Instr.InsertAdjacentText.deserialize(
                instruction as Instr.InsertAdjacentText.Serialized
              )
            );
            break;
          case Instr.InstructionType.PrependChild:
            Instr.PrependChild.apply(
              { window, nodes },
              Instr.PrependChild.deserialize(
                instruction as Instr.PrependChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.Normalize:
            Instr.Normalize.apply(
              { window, nodes },
              Instr.Normalize.deserialize(
                instruction as Instr.Normalize.Serialized
              )
            );
            break;
          case Instr.InstructionType.InsertBefore:
            Instr.InsertBefore.apply(
              { window, nodes },
              Instr.InsertBefore.deserialize(
                instruction as Instr.InsertBefore.Serialized
              )
            );
            break;
          case Instr.InstructionType.ReplaceChild:
            Instr.ReplaceChild.apply(
              { window, nodes },
              Instr.ReplaceChild.deserialize(
                instruction as Instr.ReplaceChild.Serialized
              )
            );
            break;
          case Instr.InstructionType.RemoveAttribute:
            Instr.RemoveAttribute.apply(
              { window, nodes },
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
  };

  const connect = () => {
    if (manuallyClosed) {
      return;
    }
    state.snapshotApplied = false;
    const nextTransport = createWebSocketClientTransport(url);
    transport = nextTransport;
    client.transport = nextTransport;
    const messageUnsub = nextTransport.onMessage(handleMessage);
    let closeUnsub: (() => void) | null = null;

    nextTransport.onOpen?.(() => {
      reconnectAttempts = 0;
      state.reconnectAttempts = 0;
      state.reconnecting = false;
      sendReady();
      if (readyInterval === null) {
        readyInterval = window.setInterval(() => {
          if (state.snapshotApplied) {
            if (readyInterval !== null) {
              clearInterval(readyInterval);
              readyInterval = null;
            }
            return;
          }
          sendReady();
        }, 250);
      }
      if (connectedOnce || state.pendingResync) {
        state.pendingResync = false;
        sendPayload({ type: "resync" });
      }
      connectedOnce = true;
      console.log("Connection opened");
    });
    nextTransport.onError?.((error) => {
      console.error("WebSocket error:", error);
    });
    closeUnsub = nextTransport.onClose(() => {
      messageUnsub();
      closeUnsub?.();
      closeUnsub = null;
      if (readyInterval !== null) {
        clearInterval(readyInterval);
        readyInterval = null;
      }
      console.log("Connection closed");
      scheduleReconnect();
    });
  };

  const close = () => {
    manuallyClosed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (readyInterval !== null) {
      clearInterval(readyInterval);
      readyInterval = null;
    }
    if (transport) {
      transport.close();
    }
  };

  function sendEvent(event: Event, overrideType?: string): void {
    const serializedEvent = serializeEvent(event);
    const payload = overrideType
      ? { ...serializedEvent, type: overrideType }
      : serializedEvent;
    sendPayload({
      type: "event",
      event: payload,
    } as EventMessage);
  }

  function resync(): void {
    if (!sendPayload({ type: "resync" })) {
      state.pendingResync = true;
    }
  }

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
  eventTypes.forEach((eventType) => {
    document.addEventListener(eventType, sendEvent, true);
  });

  const debouncedSendMouseEvent = debounce(sendEvent, 250);
  const mouseEventTypes = ["mouseover", "mouseout", "mousemove"];
  mouseEventTypes.forEach((eventType) => {
    const handler =
      eventType === "mousemove" ? debouncedSendMouseEvent : sendEvent;
    document.addEventListener(eventType, handler as EventListener, true);
  });
  document.addEventListener(
    "mouseover",
    (event) => {
      sendEvent(event, "mouseenter");
    },
    true
  );
  document.addEventListener(
    "mouseout",
    (event) => {
      sendEvent(event, "mouseleave");
    },
    true
  );

  window.addEventListener("resize", (event) => {
    sendEvent(event);
  });
  window.addEventListener(
    "scroll",
    (event) => {
      sendEvent(event);
    },
    true
  );

  const client: WebsocketDomClient = {
    transport,
    state,
    resync,
    close,
    connect,
  };

  connect();

  return client;
}
