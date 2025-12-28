import type { TransportConnection } from "../core/transport/types";
import type { WebSocket } from "ws";

export function createWebSocketServerTransport(
  ws: WebSocket
): TransportConnection {
  const messageHandlers = new Set<(data: string) => void>();
  const closeHandlers = new Set<() => void>();
  const openHandlers = new Set<() => void>();
  const errorHandlers = new Set<(error: unknown) => void>();

  ws.on("message", (data) => {
    const payload = typeof data === "string" ? data : data.toString();
    messageHandlers.forEach((handler) => handler(payload));
  });
  ws.on("close", () => {
    closeHandlers.forEach((handler) => handler());
  });
  ws.on("open", () => {
    openHandlers.forEach((handler) => handler());
  });
  ws.on("error", (error) => {
    errorHandlers.forEach((handler) => handler(error));
  });

  return {
    send: (data: string) => ws.send(data),
    close: () => ws.close(),
    isOpen: () => ws.readyState === ws.OPEN,
    onMessage: (handler) => {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onClose: (handler) => {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    onOpen: (handler) => {
      if (ws.readyState === ws.OPEN) {
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
