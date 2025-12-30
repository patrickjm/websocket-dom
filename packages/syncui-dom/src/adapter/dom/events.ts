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
type EventDeserializer = (
  event: SerializedEvent,
  window: AdapterWindow
) => Event;

const getConstructorWindow = (window: AdapterWindow): ConstructorWindow =>
  window as ConstructorWindow;

const mouseButtonTypes = new Set([
  "mousedown",
  "mouseup",
  "dblclick",
  "contextmenu",
]);

const keyTypes = new Set(["keydown", "keyup", "keypress"]);

const focusTypes = new Set(["focus", "blur", "focusin", "focusout"]);

const pointerTypes = new Set([
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerenter",
  "pointerleave",
  "pointerover",
  "pointerout",
  "pointercancel",
]);

const touchTypes = new Set([
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
]);

const clipboardTypes = new Set(["copy", "cut", "paste"]);

const compositionTypes = new Set([
  "compositionstart",
  "compositionupdate",
  "compositionend",
]);

const mouseMoveTypes = new Set([
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseout",
  "mouseover",
]);

const dragTypes = new Set([
  "dragstart",
  "drag",
  "dragend",
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
]);

const fallbackOnlyTypes = new Set(["selectionchange", "scroll", "resize"]);

const byTypeDeserializers = new Map<string, EventDeserializer>([
  ["click", deserializeClickEvent as EventDeserializer],
  ["change", deserializeChangeEvent as EventDeserializer],
  ["input", deserializeInputEvent as EventDeserializer],
  ["submit", deserializeSubmitEvent as EventDeserializer],
  ["wheel", deserializeWheelEvent as EventDeserializer],
  ["beforeinput", deserializeBeforeInputEvent as EventDeserializer],
]);

export function dispatchEvent(
  _nodes: NodeStash,
  _emitter: DomEmitter,
  window: AdapterWindow,
  event: SerializedEvent
) {
  const [targetElement, dispatchedEvent] = deserializeEvent(window, event);
  if (!(targetElement && dispatchedEvent)) {
    return;
  }
  preventAnchorNavigation(window, targetElement, event.type, dispatchedEvent);
  if (event.type === "input" || event.type === "change") {
    applyInputValue(window, targetElement, event.value);
  }
  targetElement.dispatchEvent(dispatchedEvent);
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
  const dispatchTarget = fallbackOnlyTypes.has(event.type)
    ? fallbackTarget
    : targetElement ?? fallbackTarget;
  const deserializer = getEventDeserializer(event.type);
  return [dispatchTarget, deserializer(event, window)];
}

const preventAnchorNavigation = (
  window: AdapterWindow,
  targetElement: DispatchTarget,
  type: string,
  dispatchedEvent: Event
) => {
  if (type !== "click") {
    return;
  }
  const ctorWindow = getConstructorWindow(window);
  if (!(targetElement instanceof ctorWindow.HTMLElement)) {
    return;
  }
  const anchor = targetElement.closest("a");
  if (anchor) {
    dispatchedEvent.preventDefault();
  }
};

const getEventDeserializer = (
  type: string
): ((event: SerializedEvent, window: AdapterWindow) => Event) => {
  const direct = byTypeDeserializers.get(type);
  if (direct) {
    return direct;
  }
  const grouped = getGroupedDeserializer(type);
  if (grouped) {
    return grouped;
  }
  return deserializeDefaultEvent;
};

const getGroupedDeserializer = (
  type: string
): ((event: SerializedEvent, window: AdapterWindow) => Event) | null => {
  const groups: Array<{
    types: Set<string>;
    handler: (event: SerializedEvent, window: AdapterWindow) => Event;
  }> = [
    {
      types: mouseButtonTypes,
      handler: deserializeMouseButtonEvent as EventDeserializer,
    },
    { types: keyTypes, handler: deserializeKeyboardEvent as EventDeserializer },
    { types: focusTypes, handler: deserializeFocusEvent as EventDeserializer },
    {
      types: pointerTypes,
      handler: deserializePointerEvent as EventDeserializer,
    },
    { types: touchTypes, handler: deserializeTouchEvent as EventDeserializer },
    {
      types: clipboardTypes,
      handler: deserializeClipboardEvent as EventDeserializer,
    },
    {
      types: compositionTypes,
      handler: deserializeCompositionEvent as EventDeserializer,
    },
    {
      types: mouseMoveTypes,
      handler: deserializeMouseEvent as EventDeserializer,
    },
    { types: dragTypes, handler: deserializeDragEvent as EventDeserializer },
  ];
  for (const group of groups) {
    if (group.types.has(type)) {
      return group.handler;
    }
  }
  return null;
};

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
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
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
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
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
    repeat: event.repeat ?? false,
    isComposing: event.isComposing ?? false,
    charCode: event.charCode,
    keyCode: event.keyCode,
    which: event.which,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
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
  _event: SerializedChangeEvent,
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
    isComposing: event.isComposing ?? false,
  });
  return inputEvent;
}

function deserializeSubmitEvent(
  _event: SerializedSubmitEvent,
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
  const apply = () => {
    applyInputValueToElement(window, element, value);
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
  const key = getSimulatedKey(event);
  if (!key) {
    return;
  }
  if (!isTextInputElement(window, element)) {
    return;
  }
  const value = element.value;
  const selectionStart = element.selectionStart ?? value.length;
  const selectionEnd = element.selectionEnd ?? value.length;
  const update = resolveKeyboardUpdate(
    window,
    element,
    key,
    value,
    selectionStart,
    selectionEnd
  );
  if (!update) {
    return;
  }
  applyKeyboardUpdate(window, element, update, value);
  dispatchKeyboardInputEvent(window, element, update);
  if (update.shouldDispatchChange) {
    dispatchChangeEvent(window, element);
  }
}

function isSimulatedEvent(event: SerializedEvent): boolean {
  if (!("simulate" in event)) {
    return false;
  }
  return Boolean((event as { simulate?: boolean }).simulate);
}

function applyInputValueToElement(
  window: AdapterWindow,
  element: EventTarget,
  value: string
): boolean {
  if (isTextInputElement(window, element)) {
    element.value = value;
    return true;
  }
  if (isContentEditableElement(window, element)) {
    element.textContent = value;
    return true;
  }
  if (element && "value" in element) {
    (element as HTMLInputElement).value = value;
    return true;
  }
  return false;
}

function isContentEditableElement(
  window: AdapterWindow,
  element: EventTarget
): element is HTMLElement {
  const ctorWindow = getConstructorWindow(window);
  if (!(element instanceof ctorWindow.HTMLElement)) {
    return false;
  }
  return (
    element.isContentEditable ||
    element.getAttribute("contenteditable") !== null
  );
}

function getSimulatedKey(event: SerializedEvent): string | null {
  if (event.type !== "keydown") {
    return null;
  }
  if (!isSimulatedEvent(event)) {
    return null;
  }
  if (!("key" in event)) {
    return null;
  }
  const key = event.key;
  if (typeof key !== "string") {
    return null;
  }
  return key;
}

type KeyboardUpdate = {
  nextValue: string;
  nextCaret: number;
  inputType: string;
  data: string | null;
  shouldDispatchChange: boolean;
};

function resolveKeyboardUpdate(
  window: AdapterWindow,
  element: HTMLInputElement | HTMLTextAreaElement,
  key: string,
  value: string,
  selectionStart: number,
  selectionEnd: number
): KeyboardUpdate | null {
  if (key === "Backspace") {
    return resolveBackspaceUpdate(value, selectionStart, selectionEnd);
  }
  if (key === "Delete") {
    return resolveDeleteUpdate(value, selectionStart, selectionEnd);
  }
  if (key === "Enter") {
    return resolveEnterUpdate(
      window,
      element,
      value,
      selectionStart,
      selectionEnd
    );
  }
  if (key.length === 1) {
    return resolveInsertUpdate(value, selectionStart, selectionEnd, key);
  }
  return null;
}

function resolveBackspaceUpdate(
  value: string,
  selectionStart: number,
  selectionEnd: number
): KeyboardUpdate | null {
  if (selectionStart !== selectionEnd) {
    return {
      nextValue: value.slice(0, selectionStart) + value.slice(selectionEnd),
      nextCaret: selectionStart,
      inputType: "deleteContentBackward",
      data: null,
      shouldDispatchChange: false,
    };
  }
  if (selectionStart > 0) {
    return {
      nextValue: value.slice(0, selectionStart - 1) + value.slice(selectionEnd),
      nextCaret: selectionStart - 1,
      inputType: "deleteContentBackward",
      data: null,
      shouldDispatchChange: false,
    };
  }
  return null;
}

function resolveDeleteUpdate(
  value: string,
  selectionStart: number,
  selectionEnd: number
): KeyboardUpdate | null {
  if (selectionStart !== selectionEnd) {
    return {
      nextValue: value.slice(0, selectionStart) + value.slice(selectionEnd),
      nextCaret: selectionStart,
      inputType: "deleteContentForward",
      data: null,
      shouldDispatchChange: false,
    };
  }
  if (selectionStart < value.length) {
    return {
      nextValue:
        value.slice(0, selectionStart) + value.slice(selectionStart + 1),
      nextCaret: selectionStart,
      inputType: "deleteContentForward",
      data: null,
      shouldDispatchChange: false,
    };
  }
  return null;
}

function resolveEnterUpdate(
  window: AdapterWindow,
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  selectionStart: number,
  selectionEnd: number
): KeyboardUpdate | null {
  const ctorWindow = getConstructorWindow(window);
  if (!(element instanceof ctorWindow.HTMLTextAreaElement)) {
    return null;
  }
  return {
    nextValue: `${value.slice(0, selectionStart)}\n${value.slice(
      selectionEnd
    )}`,
    nextCaret: selectionStart + 1,
    inputType: "insertLineBreak",
    data: null,
    shouldDispatchChange: true,
  };
}

function resolveInsertUpdate(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: string
): KeyboardUpdate {
  return {
    nextValue: value.slice(0, selectionStart) + key + value.slice(selectionEnd),
    nextCaret: selectionStart + 1,
    inputType: "insertText",
    data: key,
    shouldDispatchChange: false,
  };
}

function applyKeyboardUpdate(
  window: AdapterWindow,
  element: HTMLInputElement | HTMLTextAreaElement,
  update: KeyboardUpdate,
  value: string
) {
  if (update.nextValue === value) {
    return;
  }
  applyInputValue(window, element, update.nextValue, { suppress: false });
  if (typeof element.setSelectionRange === "function") {
    element.setSelectionRange(update.nextCaret, update.nextCaret);
  }
}

function dispatchKeyboardInputEvent(
  window: AdapterWindow,
  element: HTMLInputElement | HTMLTextAreaElement,
  update: KeyboardUpdate
) {
  const ctorWindow = getConstructorWindow(window);
  const inputEvent = new ctorWindow.InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: update.inputType,
    data: update.data,
    isComposing: false,
  });
  element.dispatchEvent(inputEvent);
}

function dispatchChangeEvent(
  window: AdapterWindow,
  element: HTMLInputElement | HTMLTextAreaElement
) {
  const ctorWindow = getConstructorWindow(window);
  const changeEvent = new ctorWindow.Event("change", {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(changeEvent);
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
