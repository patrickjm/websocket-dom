import type { EventMessage, Message } from "../ws-messages";
import { NodeStash } from "../dom/nodes";
import { debounce } from "../shared-utils";
import { serializeEvent } from "./events";
import * as Instr from "../dom/instructions";

/**
 * Creates a client that connects to a websocket-dom server and starts the sync.
 * @param uri The URI to connect to, e.g. ws://localhost:3000
 */
export function createClient(url: string) {
  const ws = new WebSocket(url);
  const nodes = new NodeStash(window);
  console.log('nodes', nodes);
  let readyInterval: number | null = null;
  const state = {
    snapshotApplied: false,
    lastMessageType: '',
  };

  ws.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data) as Message;
    state.lastMessageType = data.type;
    if (data.type === 'snapshot') {
      state.snapshotApplied = true;
      const applyAttributes = (element: Element | null, attributes: [string, string][]) => {
        if (!element) {
          return;
        }
        attributes.forEach(([name, value]) => {
          element.setAttribute(name, value);
        });
      };
      applyAttributes(document.documentElement, data.htmlAttributes);
      applyAttributes(document.head, data.headAttributes);
      applyAttributes(document.body, data.bodyAttributes);
      if (document.head) {
        document.head.innerHTML = data.headHtml;
      }
      if (document.body) {
        document.body.innerHTML = data.bodyHtml;
      }
    } else if (data.type === 'instructions') {
      for (const instruction of data.instructions) {
        const [type] = instruction;
        switch (type) {
          case Instr.InstructionType.CreateElement:
            Instr.CreateElement.apply({ window, nodes }, Instr.CreateElement.deserialize(instruction as Instr.CreateElement.Serialized));
            break;
          case Instr.InstructionType.SetAttribute:
            Instr.SetAttribute.apply({ window, nodes }, Instr.SetAttribute.deserialize(instruction as Instr.SetAttribute.Serialized));
            break;
          case Instr.InstructionType.SetProperty:
            Instr.SetProperty.apply({ window, nodes }, Instr.SetProperty.deserialize(instruction as Instr.SetProperty.Serialized));
            break;
          case Instr.InstructionType.AppendChild:
            Instr.AppendChild.apply({ window, nodes }, Instr.AppendChild.deserialize(instruction as Instr.AppendChild.Serialized));
            break;
          case Instr.InstructionType.CreateDocumentFragment:
            Instr.CreateDocumentFragment.apply({ window, nodes }, Instr.CreateDocumentFragment.deserialize(instruction as Instr.CreateDocumentFragment.Serialized));
            break;
          case Instr.InstructionType.CreateTextNode:
            Instr.CreateTextNode.apply({ window, nodes }, Instr.CreateTextNode.deserialize(instruction as Instr.CreateTextNode.Serialized));
            break;
          case Instr.InstructionType.RemoveChild:
            Instr.RemoveChild.apply({ window, nodes }, Instr.RemoveChild.deserialize(instruction as Instr.RemoveChild.Serialized));
            break;
          case Instr.InstructionType.CloneNode:
            Instr.CloneNode.apply({ window, nodes }, Instr.CloneNode.deserialize(instruction as Instr.CloneNode.Serialized));
            break;
          case Instr.InstructionType.InsertAdjacentElement:
            Instr.InsertAdjacentElement.apply({ window, nodes }, Instr.InsertAdjacentElement.deserialize(instruction as Instr.InsertAdjacentElement.Serialized));
            break;
          case Instr.InstructionType.InsertAdjacentHTML:
            Instr.InsertAdjacentHTML.apply({ window, nodes }, Instr.InsertAdjacentHTML.deserialize(instruction as Instr.InsertAdjacentHTML.Serialized));
            break;
          case Instr.InstructionType.InsertAdjacentText:
            Instr.InsertAdjacentText.apply({ window, nodes }, Instr.InsertAdjacentText.deserialize(instruction as Instr.InsertAdjacentText.Serialized));
            break;
          case Instr.InstructionType.PrependChild:
            Instr.PrependChild.apply({ window, nodes }, Instr.PrependChild.deserialize(instruction as Instr.PrependChild.Serialized));
            break;
          case Instr.InstructionType.Normalize:
            Instr.Normalize.apply({ window, nodes }, Instr.Normalize.deserialize(instruction as Instr.Normalize.Serialized));
            break;
          case Instr.InstructionType.InsertBefore:
            Instr.InsertBefore.apply({ window, nodes }, Instr.InsertBefore.deserialize(instruction as Instr.InsertBefore.Serialized));
            break;
          case Instr.InstructionType.ReplaceChild:
            Instr.ReplaceChild.apply({ window, nodes }, Instr.ReplaceChild.deserialize(instruction as Instr.ReplaceChild.Serialized));
            break;
          case Instr.InstructionType.RemoveAttribute:
            Instr.RemoveAttribute.apply({ window, nodes }, Instr.RemoveAttribute.deserialize(instruction as Instr.RemoveAttribute.Serialized));
            break;
        }
      }
    } else if (data.type === 'error') {
      console.error(data.error, data.errorInfo);
    }
  };

  const sendReady = () => {
    ws.send(JSON.stringify({ type: 'ready' }));
  };

  ws.addEventListener('open', () => {
    sendReady();
    if (readyInterval === null) {
      readyInterval = window.setInterval(() => {
        if (state.snapshotApplied) {
          if (readyInterval !== null) {
            clearInterval(readyInterval);
            readyInterval = null;
          }
          return;
        }
        sendReady();
      }, 250);
    }
    console.log('Connection opened');
  });

  if (ws.readyState === WebSocket.OPEN) {
    sendReady();
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    if (readyInterval !== null) {
      clearInterval(readyInterval);
      readyInterval = null;
    }
    console.log('Connection closed');
  };

  function sendEvent(event: Event, overrideType?: string): void {
    const serializedEvent = serializeEvent(event);
    const payload = overrideType
      ? { ...serializedEvent, type: overrideType }
      : serializedEvent;
    ws.send(JSON.stringify({
      type: 'event',
      event: payload
    } as EventMessage));
  }

  const eventTypes = [
    'click',
    'mousedown',
    'mouseup',
    'dblclick',
    'contextmenu',
    'keydown',
    'keypress',
    'keyup',
    'input',
    'change',
    'submit',
    'focus',
    'blur',
    'focusin',
    'focusout',
    'dragstart',
    'drag',
    'dragend',
    'dragenter',
    'dragover',
    'dragleave',
    'drop',
    'pointerdown',
    'pointerup',
    'pointermove',
    'pointerenter',
    'pointerleave',
    'pointerover',
    'pointerout',
    'pointercancel',
    'touchstart',
    'touchmove',
    'touchend',
    'touchcancel',
    'copy',
    'cut',
    'paste',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'beforeinput',
    'selectionchange',
    'reset',
    'invalid',
    'wheel',
    'scroll'
  ];
  eventTypes.forEach(eventType => {
    document.addEventListener(eventType, sendEvent, true);
  });

  const debouncedSendMouseEvent = debounce(sendEvent, 250);
  const mouseEventTypes = ['mouseover', 'mouseout', 'mousemove'];
  mouseEventTypes.forEach(eventType => {
    const handler = eventType === 'mousemove' ? debouncedSendMouseEvent : sendEvent;
    document.addEventListener(eventType, handler as EventListener, true);
  });
  document.addEventListener('mouseover', (event) => {
    sendEvent(event, 'mouseenter');
  }, true);
  document.addEventListener('mouseout', (event) => {
    sendEvent(event, 'mouseleave');
  }, true);

  window.addEventListener('resize', (event) => {
    sendEvent(event);
  });
  window.addEventListener('scroll', (event) => {
    sendEvent(event);
  }, true);

  return {
    ws,
    state
  }
}
