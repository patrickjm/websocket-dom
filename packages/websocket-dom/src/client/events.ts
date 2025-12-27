import type { BaseSerializedEvent, SerializedEvent } from "./types";
import { getXPath } from "../shared-utils";

export function serializeEvent(event: Event): SerializedEvent {
  const allowDefaultTypes = new Set([
    'input',
    'change',
    'focus',
    'blur',
    'focusin',
    'focusout',
    'beforeinput',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'dragstart',
    'drag',
    'dragend',
    'dragenter',
    'dragover',
    'dragleave',
    'drop',
  ]);
  if (!event.type.startsWith('key') && !allowDefaultTypes.has(event.type)) {
    event.stopPropagation();
    event.preventDefault();
  }

  let targetNode = event.target;
  if (targetNode instanceof Text && targetNode.parentElement) {
    targetNode = targetNode.parentElement;
  } else if (!(targetNode instanceof Element) && !(targetNode instanceof Text)) {
    if (document.activeElement instanceof HTMLElement) {
      targetNode = document.activeElement;
    }
  }
  const baseEvent: BaseSerializedEvent = {
    type: event.type,
    target: (targetNode instanceof Element || targetNode instanceof Text)
      ? getXPath(targetNode as Element, window)
      : null,
    timestamp: Date.now()
  };

  switch (event.type) {
    case 'click':
      return serializeClickEvent(event as MouseEvent, baseEvent);
    case 'mousedown':
    case 'mouseup':
    case 'dblclick':
    case 'contextmenu':
      return serializeMouseButtonEvent(event as MouseEvent, baseEvent);
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
    case 'wheel':
      return serializeWheelEvent(event as WheelEvent, baseEvent);
    case 'pointerdown':
    case 'pointerup':
    case 'pointermove':
    case 'pointerenter':
    case 'pointerleave':
    case 'pointerover':
    case 'pointerout':
    case 'pointercancel':
    case 'touchstart':
    case 'touchmove':
    case 'touchend':
    case 'touchcancel':
    case 'copy':
    case 'cut':
    case 'paste':
    case 'compositionstart':
    case 'compositionupdate':
    case 'compositionend':
    case 'beforeinput':
    case 'selectionchange':
    case 'scroll':
    case 'resize':
    case 'reset':
    case 'invalid':
      return baseEvent as SerializedEvent;
    case 'mouseenter':
    case 'mouseleave':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
      return serializeMouseEvent(event as MouseEvent, baseEvent);
    case 'dragstart':
    case 'drag':
    case 'dragend':
    case 'dragenter':
    case 'dragover':
    case 'dragleave':
    case 'drop':
      return serializeDragEvent(event as MouseEvent, baseEvent);
    case 'change':
      return serializeChangeEvent(event, baseEvent);
    default:
      console.warn(`Unhandled event type: ${event.type}`);
      return baseEvent as SerializedEvent;
  }
}

function getInputValue(target: EventTarget | null): string {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value;
  }
  if (target instanceof Text && target.parentElement) {
    return target.parentElement.textContent ?? '';
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return target.textContent ?? '';
  }
  if (target instanceof HTMLElement) {
    return target.textContent ?? '';
  }
  if (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) {
    return document.activeElement.textContent ?? '';
  }
  return '';
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

function serializeMouseButtonEvent(event: MouseEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as 'mousedown' | 'mouseup' | 'dblclick' | 'contextmenu',
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
  let value = getInputValue(event.target);
  if (value === '' && event.data) {
    value = event.data;
  }
  return {
    ...baseEvent,
    type: 'input',
    value,
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

function serializeDragEvent(event: MouseEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as 'dragstart' | 'drag' | 'dragend' | 'dragenter' | 'dragover' | 'dragleave' | 'drop',
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

function serializeWheelEvent(event: WheelEvent, baseEvent: BaseSerializedEvent): SerializedEvent {
  return {
    ...baseEvent,
    type: 'wheel',
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
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
    value: getInputValue(event.target),
  };
}
