import { resolveXPath } from "../shared-utils";
import { deserializeEvent, type SerializedEvent } from "../event";
import type { DOMWindow } from "jsdom";

export function simulateEvent(event: SerializedEvent, window: DOMWindow) {
  const targetElement = event.target ? resolveXPath(event.target, window.document) : null;
  const wrappedEvent = deserializeEvent(window, event);
  // Received a user event from the client browser
  if (!targetElement || !wrappedEvent) {
    return;
  }
  targetElement.dispatchEvent(wrappedEvent);

  // For keyboard events on input elements, we need to manually update the value and dispatch input/change events
  if (wrappedEvent instanceof window.KeyboardEvent && targetElement instanceof window.HTMLInputElement) {
    const key = wrappedEvent.key;
    let newValue = targetElement.value;

    // Handle key input
    if (wrappedEvent.type === 'keydown') {
      if (key.length === 1) {
        // Single character key
        const start = targetElement.selectionStart || 0;
        const end = targetElement.selectionEnd || 0;
        newValue = newValue.substring(0, start) + key + newValue.substring(end);
        targetElement.value = newValue;
        targetElement.setSelectionRange(start + 1, start + 1);
      } else if (key === 'Backspace') {
        // Handle backspace
        const start = targetElement.selectionStart || 0;
        const end = targetElement.selectionEnd || 0;
        if (start === end && start > 0) {
          newValue = newValue.substring(0, start - 1) + newValue.substring(end);
          targetElement.value = newValue;
          targetElement.setSelectionRange(start - 1, start - 1);
        } else {
          newValue = newValue.substring(0, start) + newValue.substring(end);
          targetElement.value = newValue;
          targetElement.setSelectionRange(start, start);
        }
      }
    }
    // For keyup events, we don't modify the input value

    // Dispatch synthetic input event
    const inputEvent = new window.InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: key === 'Backspace' ? 'deleteContentBackward' : 'insertText',
      data: key.length === 1 ? key : null
    });
    targetElement.dispatchEvent(inputEvent);

    // Dispatch synthetic change event on Enter
    if (key === 'Enter') {
      const changeEvent = new window.Event('change', {
        bubbles: true,
        cancelable: true
      });
      targetElement.dispatchEvent(changeEvent);
    }
  }
}