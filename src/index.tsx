import { WebSocket } from 'ws';
import { createDom } from './dom';
import { Deserialized, type Serialized } from './dom/types';
import type { InstructionMessage, Message } from './messages';

export function createWebsocketDom(ws: WebSocket, doc: string, url: string) {
  const { emitter, window, dispatchEvent } = createDom(doc, { url });

  const batch: { instructions: Serialized.Instruction[] } = { instructions: [] };
  function flush() {
    if (batch.instructions.length === 0) {
      return;
    }
    const instr = batch.instructions.slice();
    batch.instructions = [];
    ws.send(JSON.stringify({ type: 'instructions', instructions: instr } as InstructionMessage));
  }

  emitter.on('instruction', (instruction: Serialized.Instruction) => {
    batch.instructions.push(instruction);
    setTimeout(flush, 0);
  });
  emitter.on('flush', () => {
    flush();
  });

  // TODO: Initial full sync

  // Handle messages from client
  ws.on('message', async (buffer) => {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === 'event') {
      dispatchEvent(message.event);
    }
  });

  return window;
}