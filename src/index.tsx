import { WebSocket } from 'ws';
import { createDom } from './dom';
import { SetAttribute, SetProperty, type Serialized } from './dom/instructions';
import type { InstructionMessage, Message } from './messages';
import { getXPath } from 'shared-utils';

export function createWebsocketDom(ws: WebSocket, doc: string, url: string) {
  const { emitter, window, dispatchEvent, context, execute } = createDom(doc, { url });

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
  emitter.on('flush', () => {
    flush();
  });

  // Send initial instructions
  ws.send(JSON.stringify({
    type: 'instructions',
    instructions: [
      SetProperty.serialize({
        ref: { type: 'xpath', xpath: getXPath(window.document.body, window)! },
        name: 'innerHTML',
        value: window.document.body.innerHTML,
      })
    ]
  }));

  // Handle messages from client
  ws.on('message', async (buffer) => {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === 'event') {
      dispatchEvent(message.event);
    }
  });

  return {
    window,
    execute,
    context,
  };
}