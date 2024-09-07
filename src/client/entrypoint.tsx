import type { EventMessage, Message } from "../messages";
import { Nodes } from "../dom/nodes";
import { debounce } from "../utils";
import { serializeEvent } from "./events";
import { applyInstruction } from "./rendering";
import { Deserialized } from "../dom/types";

export const ws = new WebSocket('ws://localhost:3000');
const nodes = new Nodes(window);

ws.onmessage = (event: MessageEvent) => {
  const data = JSON.parse(event.data) as Message;
  if (data.type === 'instructions') {
    for (const instruction of data.instructions) {
      applyInstruction(Deserialized.instruction(instruction), nodes);
    }
  } else if (data.type === 'error') {
    console.error(data.error, data.errorInfo);
  }
};

ws.onopen = () => {
  console.log('Connection opened');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Connection closed');
};

function sendEvent(event: Event): void {
  const serializedEvent = serializeEvent(event);
  ws.send(JSON.stringify({
    type: 'event',
    event: serializedEvent
  } as EventMessage));
}

const eventTypes = ['click', 'keydown', 'keyup', 'input', 'change', 'submit', 'focus', 'blur'];
eventTypes.forEach(eventType => {
  document.addEventListener(eventType, sendEvent, true);
});

const debouncedSendMouseEvent = debounce(sendEvent, 250);
const mouseEventTypes = ['mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover'];
mouseEventTypes.forEach(eventType => {
  document.addEventListener(eventType, debouncedSendMouseEvent, true);
});