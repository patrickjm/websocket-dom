import type { TransportConnection } from "../core/transport/types";

export function createWebSocketClientTransport(
  url: string,
  WebSocketCtor: typeof WebSocket = WebSocket
): TransportConnection {
  const ws = new WebSocketCtor(url);
  return wrapBrowserWebSocket(ws);
}

export function wrapBrowserWebSocket(ws: WebSocket): TransportConnection {
  const messageHandlers = new Set<(data: string) => void>();
  const closeHandlers = new Set<() => void>();
  const openHandlers = new Set<() => void>();
  const errorHandlers = new Set<(error: unknown) => void>();
  let closed = false;

  ws.addEventListener("message", (event) => {
    const data =
      typeof event.data === "string" ? event.data : String(event.data);
    for (const handler of messageHandlers) {
      handler(data);
    }
  });
  const notifyClose = () => {
    if (closed) {
      return;
    }
    closed = true;
    for (const handler of closeHandlers) {
      handler();
    }
  };
  ws.addEventListener("close", notifyClose);
  ws.addEventListener("open", () => {
    for (const handler of openHandlers) {
      handler();
    }
  });
  ws.addEventListener("error", (event) => {
    for (const handler of errorHandlers) {
      handler(event);
    }
  });

  return {
    send: (data: string) => ws.send(data),
    close: () => {
      ws.close();
      notifyClose();
    },
    isOpen: () => ws.readyState === WebSocket.OPEN,
    onMessage: (handler) => {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onClose: (handler) => {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    onOpen: (handler) => {
      if (ws.readyState === WebSocket.OPEN) {
        queueMicrotask(handler);
      }
      openHandlers.add(handler);
      return () => openHandlers.delete(handler);
    },
    onError: (handler) => {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
  };
}
