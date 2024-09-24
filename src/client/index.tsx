import type { EventMessage, Message } from "../messages";
import { NodeStash } from "../dom/nodes";
import { debounce } from "../utils";
import { serializeEvent } from "./events";
// import { applyInstruction } from "./rendering";
import { AppendChild, CreateDocumentFragment, CreateElement, InstructionType, SetAttribute, SetProperty } from "../dom/instructions";

/**
 * Creates a client that connects to a websocket-dom server and starts the sync.
 * @param uri The URI to connect to, e.g. ws://localhost:3000
 */
export function createClient(url: string) {
  const ws = new WebSocket(url);
  const nodes = new NodeStash(window);

  ws.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data) as Message;
    if (data.type === 'instructions') {
      for (const instruction of data.instructions) {
        // applyInstruction(Deserialized.instruction(instruction), nodes);
        const [type] = instruction;
        switch (type) {
          case InstructionType.CreateElement:
            CreateElement.apply({ window, nodes }, CreateElement.deserialize(instruction as CreateElement.Serialized));
            break;
          case InstructionType.SetAttribute:
            SetAttribute.apply({ window, nodes }, SetAttribute.deserialize(instruction as SetAttribute.Serialized));
            break;
          case InstructionType.SetProperty:
            SetProperty.apply({ window, nodes }, SetProperty.deserialize(instruction as SetProperty.Serialized));
            break;
          case InstructionType.AppendChild:
            AppendChild.apply({ window, nodes }, AppendChild.deserialize(instruction as AppendChild.Serialized));
            break;
          case InstructionType.CreateDocumentFragment:
            CreateDocumentFragment.apply({ window, nodes }, CreateDocumentFragment.deserialize(instruction as CreateDocumentFragment.Serialized));
            break;
        }
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

  return {
    ws
  }
}