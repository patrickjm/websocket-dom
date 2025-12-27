import EventEmitter from 'events';
import { JSDOM } from 'jsdom';
import type TypedEmitter from 'typed-emitter';
import { WebSocket } from 'ws';
import type { SerializedEvent } from './client/types';
import { createDom } from './dom';
import { type Serialized } from './dom/instructions';
import { sanitizeElement, shouldSkipAttribute } from './dom/sanitize';
import type { InstructionMessage, Message, SnapshotMessage } from './ws-messages';

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
  const pending: Serialized[] = [];
  let clientReady = false;
  let snapshotSent = false;

  const buildInitialSnapshot = (): SnapshotMessage => {
    const snapshotDom = new JSDOM(doc, { url, contentType: 'text/html' });
    const { document } = snapshotDom.window;
    const collectAttributes = (element: Element | null): [string, string][] => {
      if (!element) {
        return [];
      }
      const attrs: [string, string][] = [];
      Array.from(element.attributes).forEach((attr) => {
        if (shouldSkipAttribute(attr.name, attr.value)) {
          return;
        }
        attrs.push([attr.name, attr.value]);
      });
      return attrs;
    };
    const getSanitizedInnerHtml = (element: Element | null): string => {
      if (!element) {
        return '';
      }
      const sanitized = sanitizeElement(element);
      return sanitized.innerHTML;
    };
    return {
      type: 'snapshot',
      htmlAttributes: collectAttributes(document.documentElement),
      headAttributes: collectAttributes(document.head),
      bodyAttributes: collectAttributes(document.body),
      headHtml: getSanitizedInnerHtml(document.head),
      bodyHtml: getSanitizedInnerHtml(document.body),
    };
  };
  const sendInitialSnapshotOnce = () => {
    if (snapshotSent) {
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      setTimeout(sendInitialSnapshotOnce, 50);
      return;
    }
    snapshotSent = true;
    const snapshot = buildInitialSnapshot();
    ws.send(JSON.stringify(snapshot));
  };
  function flush() {
    if (batch.instructions.length === 0) {
      return;
    }
    const instr = batch.instructions.slice();
    batch.instructions = [];
    ws.send(JSON.stringify({ type: 'instructions', instructions: instr } as InstructionMessage));
  }

  emitter.on('instruction', (instruction: Serialized) => {
    if (!clientReady) {
      pending.push(instruction);
      return;
    }
    batch.instructions.push(instruction);
    setTimeout(flush, 0);
  });

  // Handle messages from client
  ws.on('message', async (buffer) => {
    const message = JSON.parse(buffer.toString()) as Message;
    if (message.type === 'ready') {
      if (clientReady) {
        sendInitialSnapshotOnce();
        return;
      }
      clientReady = true;
      pending.splice(0, pending.length);
      sendInitialSnapshotOnce();
    } else if (message.type === 'event') {
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
