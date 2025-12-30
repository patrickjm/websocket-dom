import type { SerializedEvent } from "syncui/core/protocol/events";

export type EvalInPageWithArg = <T, Arg>(
  fn: (arg: Arg) => T | Promise<T>,
  arg: Arg
) => Promise<T>;

export function createDispatchEvent(evalInPageWithArg: EvalInPageWithArg) {
  return (event: SerializedEvent): void => {
    void evalInPageWithArg(
      (payload: SerializedEvent) => {
        const resolveXPathTarget = (
          xpath: string | null | undefined
        ): Element | null => {
          if (xpath) {
            const found = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;
            if (found instanceof Element) {
              return found;
            }
          }
          return null;
        };
        const resolveTarget = (): EventTarget | null => {
          if (payload.type === "resize" || payload.type === "scroll") {
            return window;
          }
          if (payload.type === "selectionchange") {
            return document;
          }
          const xpathTarget = resolveXPathTarget(payload.target);
          if (xpathTarget) {
            return xpathTarget;
          }
          if (document.activeElement instanceof Element) {
            return document.activeElement;
          }
          return document.body;
        };
        const applyInputValue = (element: Element, value: string) => {
          if (element instanceof HTMLInputElement) {
            element.value = value;
            return;
          }
          if (element instanceof HTMLTextAreaElement) {
            element.value = value;
            return;
          }
          if (element instanceof HTMLElement && element.isContentEditable) {
            element.textContent = value;
            return;
          }
          if (element instanceof HTMLElement) {
            element.textContent = value;
          }
        };
        const simulateKeyboardInput = (element: Element, key: string) => {
          if (!(element instanceof HTMLInputElement)) {
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
              nextValue =
                value.slice(0, selectionStart) + value.slice(selectionEnd);
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
              nextValue =
                value.slice(0, selectionStart) + value.slice(selectionEnd);
              nextCaret = selectionStart;
            } else if (selectionStart < value.length) {
              nextValue =
                value.slice(0, selectionStart) +
                value.slice(selectionStart + 1);
              nextCaret = selectionStart;
            } else {
              return;
            }
            inputType = "deleteContentForward";
          } else if (key === "Enter") {
            return;
          } else if (key.length === 1) {
            nextValue =
              value.slice(0, selectionStart) + key + value.slice(selectionEnd);
            nextCaret = selectionStart + 1;
            inputType = "insertText";
          } else {
            return;
          }

          if (nextValue !== value) {
            element.value = nextValue;
            if (typeof element.setSelectionRange === "function") {
              element.setSelectionRange(nextCaret, nextCaret);
            }
          }

          if (inputType) {
            const inputEvent = new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              inputType,
              data: key.length === 1 ? key : null,
              isComposing: false,
            });
            element.dispatchEvent(inputEvent);
          }
        };

        const target = resolveTarget();
        if (!target) {
          return;
        }
        const type = payload.type;

        if (
          (type === "input" || type === "change") &&
          "value" in payload &&
          payload.value !== undefined &&
          target instanceof Element
        ) {
          applyInputValue(target, String(payload.value));
        }

        if (type === "keydown" && target instanceof Element) {
          const simulate = (payload as SerializedEvent & { simulate?: boolean })
            .simulate;
          if (simulate && "key" in payload && typeof payload.key === "string") {
            simulateKeyboardInput(target, payload.key);
          }
        }

        let dispatched: Event;
        if (type.startsWith("key")) {
          if (
            payload.type !== "keydown" &&
            payload.type !== "keyup" &&
            payload.type !== "keypress"
          ) {
            return;
          }
          dispatched = new KeyboardEvent(type, {
            key: payload.key,
            code: payload.code,
            keyCode: payload.keyCode,
            which: payload.which,
            altKey: payload.altKey,
            ctrlKey: payload.ctrlKey,
            metaKey: payload.metaKey,
            shiftKey: payload.shiftKey,
            bubbles: true,
            cancelable: true,
          });
        } else if (
          type === "click" ||
          type === "mousedown" ||
          type === "mouseup" ||
          type === "dblclick" ||
          type === "contextmenu" ||
          type === "mousemove" ||
          type === "mouseout" ||
          type === "mouseover" ||
          type === "mouseenter" ||
          type === "mouseleave"
        ) {
          if (
            payload.type !== "click" &&
            payload.type !== "mousedown" &&
            payload.type !== "mouseup" &&
            payload.type !== "dblclick" &&
            payload.type !== "contextmenu" &&
            payload.type !== "mousemove" &&
            payload.type !== "mouseout" &&
            payload.type !== "mouseover" &&
            payload.type !== "mouseenter" &&
            payload.type !== "mouseleave"
          ) {
            return;
          }
          dispatched = new MouseEvent(type, {
            clientX: payload.clientX,
            clientY: payload.clientY,
            button: "button" in payload ? payload.button : 0,
            buttons: "buttons" in payload ? payload.buttons : 1,
            altKey: payload.altKey,
            ctrlKey: payload.ctrlKey,
            metaKey: payload.metaKey,
            shiftKey: payload.shiftKey,
            bubbles: true,
            cancelable: true,
          });
        } else if (type.startsWith("pointer")) {
          if (typeof PointerEvent !== "undefined") {
            dispatched = new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              clientX:
                "clientX" in payload && typeof payload.clientX === "number"
                  ? payload.clientX
                  : 0,
              clientY:
                "clientY" in payload && typeof payload.clientY === "number"
                  ? payload.clientY
                  : 0,
            });
          } else {
            dispatched = new Event(type, { bubbles: true, cancelable: true });
          }
        } else if (type === "input" || type === "beforeinput") {
          if (type === "input" && payload.type !== "input") {
            return;
          }
          dispatched = new InputEvent(type, {
            bubbles: true,
            cancelable: true,
            data: "data" in payload ? payload.data ?? null : null,
            inputType:
              "inputType" in payload && typeof payload.inputType === "string"
                ? payload.inputType
                : "insertText",
            isComposing:
              "isComposing" in payload &&
              typeof payload.isComposing === "boolean"
                ? payload.isComposing
                : false,
          });
        } else if (
          type === "compositionstart" ||
          type === "compositionupdate" ||
          type === "compositionend"
        ) {
          dispatched = new CompositionEvent(type, {
            bubbles: true,
            cancelable: true,
            data:
              "data" in payload && typeof payload.data === "string"
                ? payload.data
                : "",
          });
        } else {
          dispatched = new Event(type, { bubbles: true, cancelable: true });
        }
        target.dispatchEvent(dispatched);
      },
      event
    );
  };
}
