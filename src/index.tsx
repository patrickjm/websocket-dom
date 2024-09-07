import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import { createDom } from './dom';
import { Deserialized, type Serialized } from './dom/types';
import type { InstructionMessage, Message } from './messages';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });


wss.on('connection', (ws, req) => {
  const { emitter, window, dispatchEvent } = createDom(
    `<!DOCTYPE html><html><body><div id="root"></div></body></html>`,
    {
    url: req.headers.referer ?? req.headers.origin ?? req.url!,
  });

  const batch: { instructions: Serialized.Instruction[] } = { instructions: [] };
  function flush() {
    if (batch.instructions.length === 0) {
      return;
    }
    console.log('Flushing', batch.instructions.map(i => Deserialized.instruction(i)));
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

  // TODO: Initial sync

  const document = window.document;
  const button = document.createElement('button');
  button.innerText = 'Click me';
  button.addEventListener('click', () => {
    console.log('Button clicked');
  });
  document.body.appendChild(button);

  // Handle messages from client
  ws.on('message', async (buffer) => {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === 'event') {
      dispatchEvent(message.event);
    }
  });
});

app.use(express.static('dist'));

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});