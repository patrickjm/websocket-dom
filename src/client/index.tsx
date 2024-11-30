import * as Mut from "../dom/mutations";
import { NodeStash } from "../dom/nodes";
import { debounce } from "../shared-utils";
import type { EventMessage, Message } from "../ws-messages";
import { serializeEvent } from "../event";

/**
 * Creates a client that connects to a websocket-dom server and starts the sync.
 * @param uri The URI to connect to, e.g. ws://localhost:3000
 */
export function createClient(url: string) {
  const ws = new WebSocket(url);
  const nodes = new NodeStash(window);
  const logger = console;
  logger.debug('nodes', nodes);

  ws.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data) as Message;
    if (data.type === 'wsdom-mutation') {
      for (const mutation of data.mutations) {
        const [type] = mutation;
        switch (type) {
          case Mut.MutationType.CreateElement:
            Mut.CreateElement.apply({ window, nodes, logger }, Mut.CreateElement.deserialize(mutation as Mut.CreateElement.Serialized));
            break;
          case Mut.MutationType.RemoveElement:
            Mut.RemoveElement.apply({ window, nodes, logger }, Mut.RemoveElement.deserialize(mutation as Mut.RemoveElement.Serialized));
            break;
          case Mut.MutationType.SetAttribute:
            Mut.SetAttribute.apply({ window, nodes, logger }, Mut.SetAttribute.deserialize(mutation as Mut.SetAttribute.Serialized));
            break;
          case Mut.MutationType.SetProperty:
            Mut.SetProperty.apply({ window, nodes, logger }, Mut.SetProperty.deserialize(mutation as Mut.SetProperty.Serialized));
            break;
          case Mut.MutationType.AppendChild:
            Mut.AppendChild.apply({ window, nodes, logger }, Mut.AppendChild.deserialize(mutation as Mut.AppendChild.Serialized));
            break;
          case Mut.MutationType.CreateDocumentFragment:
            Mut.CreateDocumentFragment.apply({ window, nodes, logger }, Mut.CreateDocumentFragment.deserialize(mutation as Mut.CreateDocumentFragment.Serialized));
            break;
          case Mut.MutationType.CreateTextNode:
            Mut.CreateTextNode.apply({ window, nodes, logger }, Mut.CreateTextNode.deserialize(mutation as Mut.CreateTextNode.Serialized));
            break;
          case Mut.MutationType.RemoveChild:
            Mut.RemoveChild.apply({ window, nodes, logger }, Mut.RemoveChild.deserialize(mutation as Mut.RemoveChild.Serialized));
            break;
          case Mut.MutationType.CloneNode:
            Mut.CloneNode.apply({ window, nodes, logger }, Mut.CloneNode.deserialize(mutation as Mut.CloneNode.Serialized));
            break;
          case Mut.MutationType.InsertAdjacentElement:
            Mut.InsertAdjacentElement.apply({ window, nodes, logger }, Mut.InsertAdjacentElement.deserialize(mutation as Mut.InsertAdjacentElement.Serialized));
            break;
          case Mut.MutationType.InsertAdjacentHTML:
            Mut.InsertAdjacentHTML.apply({ window, nodes, logger }, Mut.InsertAdjacentHTML.deserialize(mutation as Mut.InsertAdjacentHTML.Serialized));
            break;
          case Mut.MutationType.InsertAdjacentText:
            Mut.InsertAdjacentText.apply({ window, nodes, logger }, Mut.InsertAdjacentText.deserialize(mutation as Mut.InsertAdjacentText.Serialized));
            break;
          case Mut.MutationType.PrependChild:
            Mut.PrependChild.apply({ window, nodes, logger }, Mut.PrependChild.deserialize(mutation as Mut.PrependChild.Serialized));
            break;
          case Mut.MutationType.Normalize:
            Mut.Normalize.apply({ window, nodes, logger }, Mut.Normalize.deserialize(mutation as Mut.Normalize.Serialized));
            break;
        }
      }
    } else if (data.type === 'wsdom-err') {
      logger.error(data.error, data.errorInfo);
    } else if (data.type === 'wsdom-client-log') {
      logger[data.level](...data.jsonStrings.map(val => JSON.parse(val)));
    }
  };

  function captureEvent(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    console.log('capturing event', event);
    const serializedEvent = serializeEvent(event);
    ws.send(JSON.stringify({
      type: 'wsdom-event',
      event: serializedEvent
    } as EventMessage));
  }

  const eventTypes = ['click', 'keydown', 'keyup', 'input', 'change', 'submit', 'focus', 'blur', 'focusin', 'focusout'];
  eventTypes.forEach(eventType => {
    document.addEventListener(eventType, captureEvent, true);
  });

  const debouncedSendMouseEvent = debounce(captureEvent, 250);
  const mouseEventTypes = ['mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover'];
  mouseEventTypes.forEach(eventType => {
    document.addEventListener(eventType, debouncedSendMouseEvent, true);
  });

  return {
    ws
  }
}