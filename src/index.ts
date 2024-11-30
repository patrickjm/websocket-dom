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

export type WebsocketDOMEvents = {
  clientEvent: (event: SerializedEvent) => void;
}

export interface WebsocketDOMLogger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
}

export type WebsocketDOMOptions = {
  /** The websocket connection */
  websocket: WebSocket | null;
  /** The HTML document to load */
  htmlDocument: string;
  /** The URL that the client is running at */
  url: string;
}

/**
 * Loads jsdom into a webworker and synchronizes it with a client browser over websocket.
 */
export class WebsocketDOM {
  private ws: WebSocket | null = null;
  private doc: string;
  private url: string;
  private emitter: TypedEmitter<WebsocketDOMEvents>;
  private batch: { instructions: Serialized[] } = { instructions: [] };
  private dom: ReturnType<typeof createDom>;

  constructor(options: WebsocketDOMOptions) {
    this.ws = options.websocket;
    this.doc = options.htmlDocument;
    this.url = options.url;
    this.emitter = new EventEmitter() as TypedEmitter<WebsocketDOMEvents>;
    this.dom = createDom(this.doc, { url: this.url });

    this.dom.emitter.on('instruction', (instruction: Serialized) => {
      this.batch.instructions.push(instruction);
      setTimeout(this.flush.bind(this), 0);
    });

    if (this.ws) {
      this.setWebsocket(this.ws);
    }
  }

  /**
   * Sets the websocket connection and starts the sync
   */
  setWebsocket(ws: WebSocket) {
    this.ws = ws;
    // Handle messages from client
    this.ws.on('message', async (buffer) => {
      const message = JSON.parse(buffer.toString()) as Message;
      if (message.type === 'wsdom-event') {
        this.dom.dispatchEvent(message.event);
        this.emitter.emit('clientEvent', message.event);
      }
    });
    this.dom.requestInitialDom();
  }

  /**
   * Imports a module into the backend dom
   */
  import(url: string) {
    return this.dom.domImport(url);
  }

  /**
   * Evaluates a string of code in the backend dom
   */
  evalString(code: string) {
    return this.dom.evalString(code);
  }

  /**
   * Terminates the websocket connection and the dom
   */
  terminate(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.dom.terminate();
  }

  /**
   * Sends an arbitrary message to the dom web worker
   */
  postWorkerMessage(message: unknown): void {
    this.dom.postWorkerMessage(message);
  }

  /**
   * Sends the current batch of instructions to the client and removes them from the queue
   */
  flush(): void {
    if (this.batch.instructions.length === 0) {
      return;
    }
    const instr = this.batch.instructions.slice();
    this.batch.instructions = [];
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'wsdom-instr', instructions: instr } as InstructionMessage));
    }
  }

  on<E extends keyof WebsocketDOMEvents>(event: E, listener: WebsocketDOMEvents[E]): this {
    this.emitter.on(event, listener);
    return this;
  }

  once<E extends keyof WebsocketDOMEvents>(event: E, listener: WebsocketDOMEvents[E]): this {
    this.emitter.once(event, listener);
    return this;
  }

  addListener<E extends keyof WebsocketDOMEvents>(event: E, listener: WebsocketDOMEvents[E]): this {
    this.emitter.addListener(event, listener);
    return this;
  }

  removeListener<E extends keyof WebsocketDOMEvents>(event: E, listener: WebsocketDOMEvents[E]): this {
    this.emitter.removeListener(event, listener);
    return this;
  }
}