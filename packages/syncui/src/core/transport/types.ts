export type TransportMessageHandler = (data: string) => void;
export type TransportCloseHandler = () => void;
export type TransportOpenHandler = () => void;
export type TransportErrorHandler = (error: unknown) => void;

export interface TransportConnection {
  send(data: string): void;
  close(): void;
  isOpen(): boolean;
  onMessage(handler: TransportMessageHandler): () => void;
  onClose(handler: TransportCloseHandler): () => void;
  onOpen?(handler: TransportOpenHandler): () => void;
  onError?(handler: TransportErrorHandler): () => void;
}
