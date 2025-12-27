import type { DOMWindow } from 'jsdom';
import { type SerializedChangeEvent, type SerializedClickEvent, type SerializedEvent, type SerializedFocusEvent, type SerializedInputEvent, type SerializedKeyboardEvent, type SerializedMouseButtonEvent, type SerializedMouseEvent, type SerializedSubmitEvent, type SerializedWheelEvent } from '../client/types';
import { type XPath } from "../shared-utils";
import type { NodeStash } from './nodes';
import type { DomEmitter } from './instructions';
import { withSuppressedTarget } from './suppress';

type DispatchTarget = HTMLElement | Document | Window | DOMWindow;

export function dispatchEvent(nodes: NodeStash, emitter: DomEmitter, window: DOMWindow, event: SerializedEvent) {
  const [targetElement, dispatchedEvent] = deserializeEvent(window, event);
  if (!targetElement || !dispatchedEvent) {
    return;
  }
  if (event.type === 'input' || event.type === 'change') {
    applyInputValue(window, targetElement, event.value);
  }
  if (dispatchedEvent) {
    targetElement.dispatchEvent(dispatchedEvent);
  }
}

function deserializeEvent(window: DOMWindow, event: SerializedEvent): [DispatchTarget | null, Event | null] {
  const targetElement = event.target ? getElementFromXPath(event.target, window.document) : null;
  const fallbackTarget = getFallbackTarget(window, event.type);

  switch (event.type) {
    case 'click':
      return [targetElement ?? fallbackTarget, deserializeClickEvent(event, window)];
    case 'mousedown':
    case 'mouseup':
    case 'dblclick':
    case 'contextmenu':
      return [targetElement ?? fallbackTarget, deserializeMouseButtonEvent(event, window)];
    case 'keydown':
    case 'keyup':
    case 'keypress':
      return [targetElement ?? fallbackTarget, deserializeKeyboardEvent(event, window)];
    case 'focus':
    case 'blur':
    case 'focusin':
    case 'focusout':
      return [targetElement ?? fallbackTarget, deserializeFocusEvent(event, window)];
    case 'change':
      const changeEvent = deserializeChangeEvent(event, window);
      return [targetElement ?? fallbackTarget, changeEvent];
    case 'input':
      const inputEvent = deserializeInputEvent(event, window);
      return [targetElement ?? fallbackTarget, inputEvent];
    case 'submit':
      return [targetElement ?? fallbackTarget, deserializeSubmitEvent(event, window)];
    case 'wheel':
      return [targetElement ?? fallbackTarget, deserializeWheelEvent(event, window)];
    case 'pointerdown':
    case 'pointerup':
    case 'pointermove':
    case 'pointerenter':
    case 'pointerleave':
    case 'pointerover':
    case 'pointerout':
    case 'pointercancel':
      return [targetElement ?? fallbackTarget, deserializePointerEvent(event, window)];
    case 'touchstart':
    case 'touchmove':
    case 'touchend':
    case 'touchcancel':
      return [targetElement ?? fallbackTarget, deserializeTouchEvent(event, window)];
    case 'copy':
    case 'cut':
    case 'paste':
      return [targetElement ?? fallbackTarget, deserializeClipboardEvent(event, window)];
    case 'compositionstart':
    case 'compositionupdate':
    case 'compositionend':
      return [targetElement ?? fallbackTarget, deserializeCompositionEvent(event, window)];
    case 'beforeinput':
      return [targetElement ?? fallbackTarget, deserializeBeforeInputEvent(event, window)];
    case 'selectionchange':
      return [fallbackTarget, deserializeDefaultEvent(event, window)];
    case 'scroll':
    case 'resize':
      return [fallbackTarget, deserializeDefaultEvent(event, window)];
    case 'reset':
    case 'invalid':
      return [targetElement ?? fallbackTarget, deserializeDefaultEvent(event, window)];
    case 'mouseenter':
    case 'mouseleave':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
      return [targetElement ?? fallbackTarget, deserializeMouseEvent(event, window)];
    default:
      console.warn(`Unhandled event type: ${(event as SerializedEvent).type}`);
      return [targetElement ?? fallbackTarget, deserializeDefaultEvent(event, window)];
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

function deserializeMouseButtonEvent(event: SerializedMouseButtonEvent, window: DOMWindow): MouseEvent {
  return new window.MouseEvent(event.type, {
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

function deserializeWheelEvent(event: SerializedWheelEvent, window: DOMWindow): Event {
  if (typeof window.WheelEvent === 'function') {
    return new window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
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
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializePointerEvent(event: SerializedEvent, window: DOMWindow): Event {
  if (typeof (window as any).PointerEvent === 'function') {
    return new (window as any).PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      view: window as any,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeTouchEvent(event: SerializedEvent, window: DOMWindow): Event {
  if (typeof (window as any).TouchEvent === 'function') {
    return new (window as any).TouchEvent(event.type, {
      bubbles: true,
      cancelable: true,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeClipboardEvent(event: SerializedEvent, window: DOMWindow): Event {
  if (typeof (window as any).ClipboardEvent === 'function') {
    return new (window as any).ClipboardEvent(event.type, {
      bubbles: true,
      cancelable: true,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeCompositionEvent(event: SerializedEvent, window: DOMWindow): Event {
  if (typeof (window as any).CompositionEvent === 'function') {
    return new (window as any).CompositionEvent(event.type, {
      bubbles: true,
      cancelable: true,
      data: null,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeBeforeInputEvent(event: SerializedEvent, window: DOMWindow): Event {
  if (typeof (window as any).InputEvent === 'function') {
    return new window.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: null,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeDefaultEvent(event: SerializedEvent, window: DOMWindow): Event {
  return new window.Event(event.type, {
    bubbles: true,
    cancelable: true,
  });
}

function isTextInputElement(window: DOMWindow, element: EventTarget): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof window.HTMLInputElement || element instanceof window.HTMLTextAreaElement;
}

function applyInputValue(window: DOMWindow, element: EventTarget, value: string) {
  withSuppressedTarget(element, () => {
    if (isTextInputElement(window, element)) {
      element.value = value;
    } else if (element instanceof window.HTMLElement && (element.isContentEditable || element.getAttribute('contenteditable') !== null)) {
      element.textContent = value;
    } else if (element && 'value' in element) {
      (element as HTMLInputElement).value = value;
    }
  });
}

function getFallbackTarget(window: DOMWindow, type: string): DispatchTarget {
  if (type === 'resize' || type === 'scroll') {
    return window;
  }
  if (type === 'selectionchange') {
    return window.document;
  }
  return window.document;
}
