import type { XPath } from "../shared-utils";

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

export interface SerializedFocusEvent extends BaseSerializedEvent {
  type: 'focus' | 'blur';
}

export interface SerializedInputEvent extends BaseSerializedEvent {
  type: 'input';
  value: string;
  inputType: string;
  data: string | null;
  isComposing: boolean;
}

export interface SerializedSubmitEvent extends BaseSerializedEvent {
  type: 'submit';
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

export interface SerializedChangeEvent extends BaseSerializedEvent {
  type: 'change';
  value: string;
}

export type SerializedEvent =
  | SerializedClickEvent
  | SerializedKeyboardEvent
  | SerializedFocusEvent
  | SerializedInputEvent
  | SerializedSubmitEvent
  | SerializedMouseEvent
  | SerializedChangeEvent;
