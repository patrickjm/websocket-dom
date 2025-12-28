import type { AdapterWindow } from "./window-types";
import type {
  SerializedChangeEvent,
  SerializedClickEvent,
  SerializedDragEvent,
  SerializedEvent,
  SerializedFocusEvent,
  SerializedInputEvent,
  SerializedKeyboardEvent,
  SerializedMouseButtonEvent,
  SerializedMouseEvent,
  SerializedSubmitEvent,
  SerializedWheelEvent,
} from "syncui/core/protocol/events";
import type { NodeStash } from "syncui/core/model/nodes";
import { getElementFromXPath } from "syncui/core/model/xpath";
import type { DomEmitter } from "syncui/core/ops/instructions";
import { withSuppressedTarget } from "./suppress";

type DispatchTarget = HTMLElement | Document | AdapterWindow;
type ConstructorWindow = Window & typeof globalThis;

const getConstructorWindow = (window: AdapterWindow): ConstructorWindow =>
  window as ConstructorWindow;

export function dispatchEvent(
  nodes: NodeStash,
  emitter: DomEmitter,
  window: AdapterWindow,
  event: SerializedEvent
) {
  const [targetElement, dispatchedEvent] = deserializeEvent(window, event);
  if (!targetElement || !dispatchedEvent) {
    return;
  }
  if (event.type === "input" || event.type === "change") {
    applyInputValue(window, targetElement, event.value);
  }
  if (dispatchedEvent) {
    targetElement.dispatchEvent(dispatchedEvent);
  }
  if (event.type === "keydown") {
    simulateKeyboardInput(window, targetElement, event);
  }
}

function deserializeEvent(
  window: AdapterWindow,
  event: SerializedEvent
): [DispatchTarget | null, Event | null] {
  const targetElement = event.target
    ? getElementFromXPath(event.target, window.document)
    : null;
  const fallbackTarget = getFallbackTarget(window, event.type);

  switch (event.type) {
    case "click":
      return [
        targetElement ?? fallbackTarget,
        deserializeClickEvent(event, window),
      ];
    case "mousedown":
    case "mouseup":
    case "dblclick":
    case "contextmenu":
      return [
        targetElement ?? fallbackTarget,
        deserializeMouseButtonEvent(event, window),
      ];
    case "keydown":
    case "keyup":
    case "keypress":
      return [
        targetElement ?? fallbackTarget,
        deserializeKeyboardEvent(event, window),
      ];
    case "focus":
    case "blur":
    case "focusin":
    case "focusout":
      return [
        targetElement ?? fallbackTarget,
        deserializeFocusEvent(event, window),
      ];
    case "change": {
      const changeEvent = deserializeChangeEvent(event, window);
      return [targetElement ?? fallbackTarget, changeEvent];
    }
    case "input": {
      const inputEvent = deserializeInputEvent(event, window);
      return [targetElement ?? fallbackTarget, inputEvent];
    }
    case "submit":
      return [
        targetElement ?? fallbackTarget,
        deserializeSubmitEvent(event, window),
      ];
    case "wheel":
      return [
        targetElement ?? fallbackTarget,
        deserializeWheelEvent(event, window),
      ];
    case "pointerdown":
    case "pointerup":
    case "pointermove":
    case "pointerenter":
    case "pointerleave":
    case "pointerover":
    case "pointerout":
    case "pointercancel":
      return [
        targetElement ?? fallbackTarget,
        deserializePointerEvent(event, window),
      ];
    case "touchstart":
    case "touchmove":
    case "touchend":
    case "touchcancel":
      return [
        targetElement ?? fallbackTarget,
        deserializeTouchEvent(event, window),
      ];
    case "copy":
    case "cut":
    case "paste":
      return [
        targetElement ?? fallbackTarget,
        deserializeClipboardEvent(event, window),
      ];
    case "compositionstart":
    case "compositionupdate":
    case "compositionend":
      return [
        targetElement ?? fallbackTarget,
        deserializeCompositionEvent(event, window),
      ];
    case "beforeinput":
      return [
        targetElement ?? fallbackTarget,
        deserializeBeforeInputEvent(event, window),
      ];
    case "selectionchange":
      return [fallbackTarget, deserializeDefaultEvent(event, window)];
    case "scroll":
    case "resize":
      return [fallbackTarget, deserializeDefaultEvent(event, window)];
    case "reset":
    case "invalid":
      return [
        targetElement ?? fallbackTarget,
        deserializeDefaultEvent(event, window),
      ];
    case "mouseenter":
    case "mouseleave":
    case "mousemove":
    case "mouseout":
    case "mouseover":
      return [
        targetElement ?? fallbackTarget,
        deserializeMouseEvent(event, window),
      ];
    case "dragstart":
    case "drag":
    case "dragend":
    case "dragenter":
    case "dragover":
    case "dragleave":
    case "drop":
      return [
        targetElement ?? fallbackTarget,
        deserializeDragEvent(event, window),
      ];
    default:
      console.warn(`Unhandled event type: ${(event as SerializedEvent).type}`);
      return [
        targetElement ?? fallbackTarget,
        deserializeDefaultEvent(event, window),
      ];
  }
}

function deserializeClickEvent(
  event: SerializedClickEvent,
  window: AdapterWindow
): MouseEvent {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: ctorWindow,
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

function deserializeMouseButtonEvent(
  event: SerializedMouseButtonEvent,
  window: AdapterWindow
): MouseEvent {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.MouseEvent(event.type, {
    bubbles: true,
    cancelable: true,
    view: ctorWindow,
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

function deserializeKeyboardEvent(
  event: SerializedKeyboardEvent,
  window: AdapterWindow
): KeyboardEvent {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.KeyboardEvent(event.type, {
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

function deserializeFocusEvent(
  event: SerializedFocusEvent,
  window: AdapterWindow
): FocusEvent {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.FocusEvent(event.type, {
    bubbles: true,
    cancelable: false,
    view: ctorWindow,
    relatedTarget: null,
  });
}

function deserializeChangeEvent(
  event: SerializedChangeEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  const changeEvent = new ctorWindow.Event("change", {
    bubbles: true,
    cancelable: true,
  });
  return changeEvent;
}

function deserializeInputEvent(
  event: SerializedInputEvent,
  window: AdapterWindow
): InputEvent {
  const ctorWindow = getConstructorWindow(window);
  const inputEvent = new ctorWindow.InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing || false,
  });
  return inputEvent;
}

function deserializeSubmitEvent(
  event: SerializedSubmitEvent,
  window: AdapterWindow
): SubmitEvent {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
  });
}

function deserializeMouseEvent(
  event: SerializedMouseEvent,
  window: AdapterWindow
): MouseEvent {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.MouseEvent(event.type, {
    bubbles: true,
    cancelable: true,
    view: ctorWindow,
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

function deserializeDragEvent(
  event: SerializedDragEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.DragEvent === "function") {
    return new ctorWindow.DragEvent(event.type, {
      bubbles: true,
      cancelable: true,
      view: ctorWindow,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
  }
  return new ctorWindow.MouseEvent(event.type, {
    bubbles: true,
    cancelable: true,
    view: ctorWindow,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  });
}

function deserializeWheelEvent(
  event: SerializedWheelEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.WheelEvent === "function") {
    return new ctorWindow.WheelEvent("wheel", {
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

function deserializePointerEvent(
  event: SerializedEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.PointerEvent === "function") {
    return new ctorWindow.PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      view: ctorWindow,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeTouchEvent(
  event: SerializedEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.TouchEvent === "function") {
    return new ctorWindow.TouchEvent(event.type, {
      bubbles: true,
      cancelable: true,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeClipboardEvent(
  event: SerializedEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.ClipboardEvent === "function") {
    return new ctorWindow.ClipboardEvent(event.type, {
      bubbles: true,
      cancelable: true,
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeCompositionEvent(
  event: SerializedEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.CompositionEvent === "function") {
    return new ctorWindow.CompositionEvent(event.type, {
      bubbles: true,
      cancelable: true,
      data: "",
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeBeforeInputEvent(
  event: SerializedEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  if (typeof ctorWindow.InputEvent === "function") {
    return new ctorWindow.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "",
    });
  }
  return deserializeDefaultEvent(event, window);
}

function deserializeDefaultEvent(
  event: SerializedEvent,
  window: AdapterWindow
): Event {
  const ctorWindow = getConstructorWindow(window);
  return new ctorWindow.Event(event.type, {
    bubbles: true,
    cancelable: true,
  });
}

function isTextInputElement(
  window: AdapterWindow,
  element: EventTarget
): element is HTMLInputElement | HTMLTextAreaElement {
  const ctorWindow = getConstructorWindow(window);
  return (
    element instanceof ctorWindow.HTMLInputElement ||
    element instanceof ctorWindow.HTMLTextAreaElement
  );
}

function applyInputValue(
  window: AdapterWindow,
  element: EventTarget,
  value: string,
  options: { suppress?: boolean } = {}
) {
  const { suppress = true } = options;
  const ctorWindow = getConstructorWindow(window);
  const apply = () => {
    if (isTextInputElement(window, element)) {
      element.value = value;
    } else if (element instanceof ctorWindow.HTMLElement) {
      const htmlElement = element as HTMLElement;
      if (
        htmlElement.isContentEditable ||
        htmlElement.getAttribute("contenteditable") !== null
      ) {
        htmlElement.textContent = value;
      }
    } else if (element && "value" in element) {
      (element as HTMLInputElement).value = value;
    }
  };
  if (suppress) {
    withSuppressedTarget(element, apply);
    return;
  }
  apply();
}

function simulateKeyboardInput(
  window: AdapterWindow,
  element: EventTarget,
  event: SerializedEvent
) {
  if (!isTextInputElement(window, element)) {
    return;
  }
  if (event.type !== "keydown") {
    return;
  }
  if (!isSimulatedEvent(event)) {
    return;
  }
  if (!("key" in event)) {
    return;
  }
  const key = event.key;
  if (typeof key !== "string") {
    return;
  }
  const value = element.value;
  const selectionStart = element.selectionStart ?? value.length;
  const selectionEnd = element.selectionEnd ?? value.length;
  let nextValue = value;
  let nextCaret = selectionStart;
  let inputType: string | null = null;

  if (key === "Backspace") {
    if (selectionStart !== selectionEnd) {
      nextValue = value.slice(0, selectionStart) + value.slice(selectionEnd);
      nextCaret = selectionStart;
    } else if (selectionStart > 0) {
      nextValue =
        value.slice(0, selectionStart - 1) + value.slice(selectionEnd);
      nextCaret = selectionStart - 1;
    } else {
      return;
    }
    inputType = "deleteContentBackward";
  } else if (key === "Delete") {
    if (selectionStart !== selectionEnd) {
      nextValue = value.slice(0, selectionStart) + value.slice(selectionEnd);
      nextCaret = selectionStart;
    } else if (selectionStart < value.length) {
      nextValue =
        value.slice(0, selectionStart) + value.slice(selectionStart + 1);
      nextCaret = selectionStart;
    } else {
      return;
    }
    inputType = "deleteContentForward";
  } else if (key === "Enter") {
    const ctorWindow = getConstructorWindow(window);
    if (element instanceof ctorWindow.HTMLTextAreaElement) {
      nextValue = `${value.slice(0, selectionStart)}\n${value.slice(
        selectionEnd
      )}`;
      nextCaret = selectionStart + 1;
      inputType = "insertLineBreak";
    }
  } else if (key.length === 1) {
    nextValue =
      value.slice(0, selectionStart) + key + value.slice(selectionEnd);
    nextCaret = selectionStart + 1;
    inputType = "insertText";
  } else {
    return;
  }

  if (nextValue !== value) {
    applyInputValue(window, element, nextValue, { suppress: false });
    if (typeof element.setSelectionRange === "function") {
      element.setSelectionRange(nextCaret, nextCaret);
    }
  }

  if (inputType) {
    const ctorWindow = getConstructorWindow(window);
    const inputEvent = new ctorWindow.InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType,
      data: key.length === 1 ? key : null,
      isComposing: false,
    });
    element.dispatchEvent(inputEvent);
  }

  if (key === "Enter") {
    const ctorWindow = getConstructorWindow(window);
    const changeEvent = new ctorWindow.Event("change", {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(changeEvent);
  }
}

function isSimulatedEvent(event: SerializedEvent): boolean {
  if (!("simulate" in event)) {
    return false;
  }
  return Boolean((event as { simulate?: boolean }).simulate);
}

function getFallbackTarget(
  window: AdapterWindow,
  type: string
): DispatchTarget {
  if (type === "resize" || type === "scroll") {
    return window;
  }
  if (type === "selectionchange") {
    return window.document;
  }
  return window.document;
}
