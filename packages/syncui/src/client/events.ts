import type {
  BaseSerializedEvent,
  SerializedEvent,
} from "../core/protocol/events";
import { getXPath } from "../shared-utils";

const allowDefaultTypes = new Set([
  "input",
  "change",
  "focus",
  "blur",
  "focusin",
  "focusout",
  "beforeinput",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "dragstart",
  "drag",
  "dragend",
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
]);

const passthroughTypes = new Set([
  "focus",
  "blur",
  "focusin",
  "focusout",
  "submit",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerenter",
  "pointerleave",
  "pointerover",
  "pointerout",
  "pointercancel",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "copy",
  "cut",
  "paste",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "beforeinput",
  "selectionchange",
  "scroll",
  "resize",
  "reset",
  "invalid",
]);

const mouseButtonTypes = new Set([
  "mousedown",
  "mouseup",
  "dblclick",
  "contextmenu",
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

export function serializeEvent(event: Event): SerializedEvent {
  if (!(event.type.startsWith("key") || allowDefaultTypes.has(event.type))) {
    event.stopPropagation();
    event.preventDefault();
  }

  const targetNode = resolveTargetNode(event.target);
  const baseEvent: BaseSerializedEvent = {
    type: event.type,
    target:
      targetNode instanceof Element || targetNode instanceof Text
        ? getXPath(targetNode as Element, window)
        : null,
    timestamp: Date.now(),
  };

  const handler = getEventHandler(event.type);
  if (handler) {
    return handler(event, baseEvent);
  }
  if (passthroughTypes.has(event.type)) {
    return baseEvent as SerializedEvent;
  }
  console.warn(`Unhandled event type: ${event.type}`);
  return baseEvent as SerializedEvent;
}

const resolveTargetNode = (
  target: EventTarget | null
): Element | Text | null => {
  if (target instanceof Text) {
    return target.parentElement ?? target;
  }
  if (target instanceof Element) {
    return target;
  }
  if (document.activeElement instanceof HTMLElement) {
    return document.activeElement;
  }
  return null;
};

const getEventHandler = (
  type: string
):
  | ((event: Event, baseEvent: BaseSerializedEvent) => SerializedEvent)
  | null => {
  if (type === "click") {
    return (event, baseEvent) =>
      serializeClickEvent(event as MouseEvent, baseEvent);
  }
  if (mouseButtonTypes.has(type)) {
    return (event, baseEvent) =>
      serializeMouseButtonEvent(event as MouseEvent, baseEvent);
  }
  if (type.startsWith("key")) {
    return (event, baseEvent) =>
      serializeKeyboardEvent(event as KeyboardEvent, baseEvent);
  }
  if (type === "input") {
    return (event, baseEvent) =>
      serializeInputEvent(event as InputEvent, baseEvent);
  }
  if (type === "wheel") {
    return (event, baseEvent) =>
      serializeWheelEvent(event as WheelEvent, baseEvent);
  }
  if (mouseMoveTypes.has(type)) {
    return (event, baseEvent) =>
      serializeMouseEvent(event as MouseEvent, baseEvent);
  }
  if (dragTypes.has(type)) {
    return (event, baseEvent) =>
      serializeDragEvent(event as MouseEvent, baseEvent);
  }
  if (type === "change") {
    return (event, baseEvent) => serializeChangeEvent(event, baseEvent);
  }
  return null;
};

function getInputValue(target: EventTarget | null): string {
  const directValue = getTargetInputValue(target);
  if (directValue !== null) {
    return directValue;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable) {
    return active.textContent ?? "";
  }
  return "";
}

const getTargetInputValue = (target: EventTarget | null): string | null => {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return target.value;
  }
  if (target instanceof Text && target.parentElement) {
    return target.parentElement.textContent ?? "";
  }
  if (target instanceof HTMLElement) {
    return target.textContent ?? "";
  }
  return null;
};

function serializeClickEvent(
  event: MouseEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: "click",
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

function serializeMouseButtonEvent(
  event: MouseEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as "mousedown" | "mouseup" | "dblclick" | "contextmenu",
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

function serializeKeyboardEvent(
  event: KeyboardEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as "keydown" | "keyup" | "keypress",
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

function serializeInputEvent(
  event: InputEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  let value = getInputValue(event.target);
  if (value === "" && event.data) {
    value = event.data;
  }
  return {
    ...baseEvent,
    type: "input",
    value,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing ?? false,
  };
}

function serializeMouseEvent(
  event: MouseEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as
      | "mouseenter"
      | "mouseleave"
      | "mousemove"
      | "mouseout"
      | "mouseover",
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

function serializeDragEvent(
  event: MouseEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: event.type as
      | "dragstart"
      | "drag"
      | "dragend"
      | "dragenter"
      | "dragover"
      | "dragleave"
      | "drop",
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

function serializeWheelEvent(
  event: WheelEvent,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: "wheel",
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

function serializeChangeEvent(
  event: Event,
  baseEvent: BaseSerializedEvent
): SerializedEvent {
  return {
    ...baseEvent,
    type: "change",
    value: getInputValue(event.target),
  };
}
