import type { EventMessage, Message } from "../messages";
import { NodeStash } from "../dom/nodes";
import { debounce } from "../utils";
import { serializeEvent } from "./events";
// import { applyInstruction } from "./rendering";
import * as Instr from "../dom/instructions";

/**
 * Creates a client that connects to a websocket-dom server and starts the sync.
 * @param uri The URI to connect to, e.g. ws://localhost:3000
 */
export function createClient(url: string) {
  const ws = new WebSocket(url);
  const nodes = new NodeStash(window);
  console.log('nodes', nodes);

  ws.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data) as Message;
    if (data.type === 'instructions') {
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