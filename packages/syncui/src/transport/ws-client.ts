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

  ws.addEventListener("message", (event) => {
    const data = typeof event.data === "string" ? event.data : String(event.data);
    messageHandlers.forEach((handler) => handler(data));
  });
  ws.addEventListener("close", () => {
    closeHandlers.forEach((handler) => handler());
  });
  ws.addEventListener("open", () => {
    openHandlers.forEach((handler) => handler());
  });
  ws.addEventListener("error", (event) => {
    errorHandlers.forEach((handler) => handler(event));
  });

  return {
    send: (data: string) => ws.send(data),
    close: () => ws.close(),
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
