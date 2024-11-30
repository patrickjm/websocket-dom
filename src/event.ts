import type { DOMWindow } from "jsdom";
import { getXPath, resolveXPath, type WindowLike, type XPath } from "./shared-utils";

export function serializeEvent(event: Event): SerializedEvent {
  switch (event.type) {
    case 'click':
      return serializeClickEvent(event as MouseEvent, window, event.target as Element|Text);
    case 'keydown':
    case 'keyup':
    case 'keypress':
      return serializeKeyboardEvent(event as KeyboardEvent, window, event.target as Element|Text);
    case 'focus':
    case 'blur':
    case 'focusin':
    case 'focusout':
      return serializeFocusEvent(event as FocusEvent, window, event.target as Element|Text);
    case 'input':
      return serializeInputEvent(event as InputEvent, window, event.target as Element|Text);
    case 'submit':
      return serializeSubmitEvent(event as SubmitEvent, window, event.target as Element|Text);
    case 'mouseenter':
    case 'mouseleave':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
      return serializeMouseEvent(event as MouseEvent, window, event.target as Element|Text);
    case 'change':
      return serializeChangeEvent(event, window, event.target as Element|Text);
    default:
      console.warn(`Unhandled event type: ${event.type}`);
      return serializeDefaultEvent(event, window, event.target as Element|Text) as SerializedEvent;
  }
}
export function deserializeEvent(window: DOMWindow, event: SerializedEvent): Event | null {
  switch (event.type) {
    case 'click':
      return deserializeClickEvent(event, window);
    case 'keydown':
    case 'keyup':
    case 'keypress':
      return deserializeKeyboardEvent(event, window);
    case 'focus':
    case 'blur':
      return deserializeFocusEvent(event, window);
    case 'change':
      const changeEvent = deserializeChangeEvent(event, window);
      return changeEvent;
    case 'input':
      const inputEvent = deserializeInputEvent(event, window);
      return inputEvent;
    case 'submit':
      return deserializeSubmitEvent(event, window);
    case 'mouseenter':
    case 'mouseleave':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
      return deserializeMouseEvent(event, window);
    default:
      console.warn(`Unhandled event type: ${(event as SerializedEvent).type}`);
      return deserializeDefaultEvent(event, window);
  }
}

export interface BaseSerializedEvent {
  type: string;
  target: XPath | null;
  timestamp: number;
}

export interface SerializedClickEvent extends BaseSerializedEvent {
  type: 'click';
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}
export function serializeClickEvent(event: MouseEvent, window: WindowLike, target: Element|Text): SerializedClickEvent {
  return {
    type: 'click',
    target: getXPath(target, window),
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    timestamp: event.timeStamp
  };
}
export function deserializeClickEvent(event: SerializedClickEvent, window: DOMWindow): MouseEvent {
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

export interface SerializedKeyboardEvent extends BaseSerializedEvent {
  type: 'keydown' | 'keyup' | 'keypress';
  key: string;
  code: string;
  location: number;
  repeat: boolean;
  isComposing: boolean;
  charCode: number;
  keyCode: number;
  which: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}
export function deserializeKeyboardEvent(event: SerializedKeyboardEvent, window: DOMWindow): KeyboardEvent {
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
export function serializeKeyboardEvent(event: KeyboardEvent, window: WindowLike, target: Element|Text): SerializedKeyboardEvent {
  return {
    type: event.type as 'keydown' | 'keyup' | 'keypress',
    target: getXPath(target, window),
    timestamp: event.timeStamp,
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

export interface SerializedFocusEvent extends BaseSerializedEvent {
  type: 'focus' | 'blur';
}
export function deserializeFocusEvent(event: SerializedFocusEvent, window: DOMWindow): FocusEvent {
  return new window.FocusEvent(event.type, {
    bubbles: true,
    cancelable: false,
    view: window as any,
    relatedTarget: null,
  });
}
export function serializeFocusEvent(event: FocusEvent, window: WindowLike, target: Element|Text): SerializedFocusEvent {
  return {
    type: event.type as 'focus' | 'blur',
    target: getXPath(target, window),
    timestamp: event.timeStamp,
  };
}

export interface SerializedInputEvent extends BaseSerializedEvent {
  type: 'input';
  value: string;
  inputType: string;
  data: string | null;
  isComposing: boolean;
}
export function deserializeInputEvent(event: SerializedInputEvent, window: DOMWindow): InputEvent {
  const inputEvent = new window.InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing || false,
  });
  return inputEvent;
}
export function serializeInputEvent(event: InputEvent, window: WindowLike, target: Element|Text): SerializedInputEvent {
  return {
    type: 'input',
    target: getXPath(target, window),
    timestamp: event.timeStamp,
    value: (event.target as HTMLInputElement).value,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing || false,
  };
}

export interface SerializedSubmitEvent extends BaseSerializedEvent {
  type: 'submit';
}
export function deserializeSubmitEvent(event: SerializedSubmitEvent, window: DOMWindow): SubmitEvent {
  return new window.SubmitEvent('submit', {
    bubbles: true,
    cancelable: true,
  });
}
export function serializeSubmitEvent(event: SubmitEvent, window: WindowLike, target: Element|Text): SerializedSubmitEvent {
  return {
    type: 'submit',
    target: getXPath(target, window),
    timestamp: event.timeStamp,
  };
}

export interface SerializedMouseEvent extends BaseSerializedEvent {
  type: 'mouseenter' | 'mouseleave' | 'mousemove' | 'mouseout' | 'mouseover';
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}
export function deserializeMouseEvent(event: SerializedMouseEvent, window: DOMWindow): MouseEvent {
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
export function serializeMouseEvent(event: MouseEvent, window: WindowLike, target: Element|Text): SerializedMouseEvent {
  return {
    type: event.type as 'mouseenter' | 'mouseleave' | 'mousemove' | 'mouseout' | 'mouseover',
    target: getXPath(target, window),
    timestamp: event.timeStamp,
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

export interface SerializedChangeEvent extends BaseSerializedEvent {
  type: 'change';
  value: string;
}
export function deserializeChangeEvent(event: SerializedChangeEvent, window: DOMWindow): Event {
  const changeEvent = new window.Event('change', {
    bubbles: true,
    cancelable: true,
  });
  return changeEvent;
}
export function serializeChangeEvent(event: Event, window: WindowLike, target: Element|Text): SerializedChangeEvent {
  return {
    type: 'change',
    target: getXPath(target, window),
    timestamp: event.timeStamp,
    value: (event.target as HTMLInputElement).value,
  };
}


export type SerializedEvent =
  | SerializedClickEvent
  | SerializedKeyboardEvent
  | SerializedFocusEvent
  | SerializedInputEvent
  | SerializedSubmitEvent
  | SerializedMouseEvent
  | SerializedChangeEvent;

export function serializeDefaultEvent(event: Event, window: WindowLike, target: Element|Text): BaseSerializedEvent {
  return {
    type: event.type,
    target: getXPath(target, window),
    timestamp: event.timeStamp,
  };
}
export function deserializeDefaultEvent(event: SerializedEvent, window: DOMWindow): Event {
  return new window.Event(event.type, {
    bubbles: true,
    cancelable: true,
  });
}