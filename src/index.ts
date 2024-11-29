import { getXPath } from 'shared-utils';
import { WebSocket } from 'ws';
import { createDom } from './dom';
import { SetProperty, type Serialized } from './dom/instructions';
import type { InstructionMessage, Message } from './ws-messages';

export function createWebsocketDom(ws: WebSocket, doc: string, url: string) {
  const {
    emitter,
    dispatchEvent,
    terminate,
    domImport,
    evalString
  } = createDom(doc, { url });

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
    }
  });

  return {
    terminate,
    dispatchEvent,
    domImport,
    evalString
  };
}