import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { WebSocket } from 'ws';
import type { SerializedEvent } from './client/types';
import { createDom } from './dom';
import { type Serialized } from './dom/instructions';
import type { InstructionMessage, Message } from './ws-messages';

export type {
  BaseSerializedEvent, SerializedChangeEvent,
  SerializedClickEvent, SerializedEvent, SerializedFocusEvent,
  SerializedInputEvent,
  SerializedKeyboardEvent,
  SerializedMouseEvent,
  SerializedSubmitEvent
} from './client/types';
export { getXPath } from './shared-utils';

export type WebsocketDomEvents = {
  clientEvent: (event: SerializedEvent) => void;
}

export function createWebsocketDom(ws: WebSocket, doc: string, url: string) {
  const {
    emitter,
    dispatchEvent,
    terminate,
    domImport,
    evalString,
    worker
  } = createDom(doc, { url });
  const publicEmitter = new EventEmitter() as TypedEmitter<WebsocketDomEvents>;

  const batch: { instructions: Serialized[] } = { instructions: [] };
  function flush() {
    if (batch.instructions.length === 0) {
      return;
    }
    const instr = batch.instructions.slice();
    batch.instructions = [];
    ws.send(JSON.stringify({ type: 'instructions', instructions: instr } as InstructionMessage));
  }

  emitter.on('instruction', (instruction: Serialized) => {
    batch.instructions.push(instruction);
    setTimeout(flush, 0);
  });

  // Handle messages from client
  ws.on('message', async (buffer) => {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === 'event') {
      dispatchEvent(message.event);
      publicEmitter.emit('clientEvent', message.event);
    }
  });

  return {
    terminate,
    dispatchEvent,
    domImport,
    evalString,
    emitter: publicEmitter,
    worker
  };
}