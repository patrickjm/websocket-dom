import type { SerializedEvent } from 'websocket-dom';

export type MessageToWorker = {
  type: '_react_event';
  event: SerializedEvent;
}
