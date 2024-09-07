import type { DOMWindow } from 'jsdom';
import { type SerializedChangeEvent, type SerializedClickEvent, type SerializedEvent, type SerializedFocusEvent, type SerializedInputEvent, type SerializedKeyboardEvent, type SerializedMouseEvent, type SerializedSubmitEvent } from '../client/types';
import { type XPath } from "../utils";
import type { Nodes } from './nodes';
import type { DomEmitter } from './types';

export function dispatchEvent(nodes: Nodes, emitter: DomEmitter, window: DOMWindow, event: SerializedEvent) {
  const [targetElement, dispatchedEvent] = deserializeEvent(window, event);
  if (!targetElement || !dispatchedEvent) {
    return;
  }
  if (event.type === 'input' || event.type === 'change') {
    (targetElement as HTMLInputElement).value = event.value;
  }
  if (dispatchedEvent) {
    targetElement.dispatchEvent(dispatchedEvent);
  }
}

function deserializeEvent(window: DOMWindow, event: SerializedEvent): [HTMLElement | null, Event | null] {
  const targetElement = event.target ? getElementFromXPath(event.target, window.document) : null;

  switch (event.type) {
    case 'click':
      return [targetElement, deserializeClickEvent(event, window)];
    case 'keydown':
    case 'keyup':
    case 'keypress':
      return [targetElement, deserializeKeyboardEvent(event, window)];
    case 'focus':
    case 'blur':
      return [targetElement, deserializeFocusEvent(event, window)];
    case 'change':
      const changeEvent = deserializeChangeEvent(event, window);
      return [targetElement, changeEvent];
    case 'input':
      const inputEvent = deserializeInputEvent(event, window);
      return [targetElement, inputEvent];
    case 'submit':
      return [targetElement, deserializeSubmitEvent(event, window)];
    case 'mouseenter':
    case 'mouseleave':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
      return [targetElement, deserializeMouseEvent(event, window)];
    default:
      console.warn(`Unhandled event type: ${(event as SerializedEvent).type}`);
      return [targetElement, deserializeDefaultEvent(event, window)];
  }
}

export function getElementFromXPath(xpath: XPath, document: Document): HTMLElement | null {
  const FIRST_ORDERED_NODE_TYPE = 9;
  return document.evaluate(xpath, document, null, FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
}

function deserializeClickEvent(event: SerializedClickEvent, window: DOMWindow): MouseEvent {
  return new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window as any,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button || 0,
    buttons: event.buttons || 1,
    altKey: event.altKey || false,
    ctrlKey: event.ctrlKey || false,
    metaKey: event.metaKey || false,
    shiftKey: event.shiftKey || false,
  });
}

function deserializeKeyboardEvent(event: SerializedKeyboardEvent, window: DOMWindow): KeyboardEvent {
  return new window.KeyboardEvent(event.type, {
    bubbles: true,
    cancelable: true,
    key: event.key,
    code: event.code,
    location: event.location || 0,
    repeat: event.repeat || false,
    isComposing: event.isComposing || false,
    charCode: event.charCode,
    keyCode: event.keyCode,
    which: event.which,
    altKey: event.altKey || false,
    ctrlKey: event.ctrlKey || false,
    metaKey: event.metaKey || false,
    shiftKey: event.shiftKey || false,
  });
}

function deserializeFocusEvent(event: SerializedFocusEvent, window: DOMWindow): FocusEvent {
  return new window.FocusEvent(event.type, {
    bubbles: true,
    cancelable: false,
    view: window as any,
    relatedTarget: null,
  });
}

function deserializeChangeEvent(event: SerializedChangeEvent, window: DOMWindow): Event {
  const changeEvent = new window.Event('change', {
    bubbles: true,
    cancelable: true,
  });
  return changeEvent;
}

function deserializeInputEvent(event: SerializedInputEvent, window: DOMWindow): InputEvent {
  const inputEvent = new window.InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing || false,
  });
  return inputEvent;
}

function deserializeSubmitEvent(event: SerializedSubmitEvent, window: DOMWindow): SubmitEvent {
  return new window.SubmitEvent('submit', {
    bubbles: true,
    cancelable: true,
  });
}

function deserializeMouseEvent(event: SerializedMouseEvent, window: DOMWindow): MouseEvent {
  return new window.MouseEvent(event.type, {
    bubbles: true,
    cancelable: true,
    view: window as any,
    detail: 0,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    button: 0,
    buttons: 1,
    relatedTarget: null,
  });
}

function deserializeDefaultEvent(event: SerializedEvent, window: DOMWindow): Event {
  return new window.Event(event.type, {
    bubbles: true,
    cancelable: true,
  });
}