import type { BaseSerializedEvent, SerializedEvent } from "./types";
import { getXPath } from "../shared-utils";

export function serializeEvent(event: Event): SerializedEvent {
  if (!event.type.startsWith('key')) {
    event.stopPropagation();
    event.preventDefault();
  }

  const baseEvent: BaseSerializedEvent = {
    type: event.type,
    target: getXPath(event.target as Element, window),
    timestamp: Date.now()
  };

  switch (event.type) {
    case 'click':
      return serializeClickEvent(event as MouseEvent, baseEvent);
    case 'keydown':
    case 'keyup':
    case 'keypress':
      return serializeKeyboardEvent(event as KeyboardEvent, baseEvent);
    case 'focus':
    case 'blur':
    case 'focusin':
    case 'focusout':
      return baseEvent as SerializedEvent;
    case 'input':
      return serializeInputEvent(event as InputEvent, baseEvent);
    case 'submit':
      return baseEvent as SerializedEvent;
    case 'mouseenter':
    case 'mouseleave':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
      return serializeMouseEvent(event as MouseEvent, baseEvent);
    case 'change':
      return serializeChangeEvent(event, baseEvent);
    default:
      console.warn(`Unhandled event type: ${event.type}`);
      return baseEvent as SerializedEvent;
  }
}

function serializeClickEvent(event: MouseEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: 'click',
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

function serializeKeyboardEvent(event: KeyboardEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as 'keydown' | 'keyup' | 'keypress',
    key: event.key,
    code: event.code,
    location: event.location,
    repeat: event.repeat,
    isComposing: event.isComposing,
    charCode: event.charCode,
    keyCode: event.keyCode,
    which: event.which,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

function serializeInputEvent(event: InputEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: 'input',
    value: (event.target as HTMLInputElement).value,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing || false,
  };
}

function serializeMouseEvent(event: MouseEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as 'mouseenter' | 'mouseleave' | 'mousemove' | 'mouseout' | 'mouseover',
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

function serializeChangeEvent(event: Event, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: 'change',
    value: (event.target as HTMLInputElement).value,
  };
}
