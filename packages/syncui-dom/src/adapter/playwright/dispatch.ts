import type { SerializedEvent } from "syncui/core/protocol/events";

export type EvalInPageWithArg = <T>(
  fn: (arg: any) => T | Promise<T>,
  arg: any
) => Promise<T>;

export function createDispatchEvent(evalInPageWithArg: EvalInPageWithArg) {
  return (event: SerializedEvent): void => {
    void evalInPageWithArg((payload: SerializedEvent) => {
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
              value.slice(0, selectionStart) + value.slice(selectionStart + 1);
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

      if (
        type === "keydown" &&
        (payload as any).simulate &&
        target instanceof Element
      ) {
        if (typeof (payload as any).key === "string") {
          simulateKeyboardInput(target, String((payload as any).key));
        }
      }

      let dispatched: Event;
      if (type.startsWith("key")) {
        dispatched = new KeyboardEvent(type, {
          key: (payload as any).key,
          code: (payload as any).code,
          keyCode: (payload as any).keyCode,
          which: (payload as any).which,
          altKey: (payload as any).altKey,
          ctrlKey: (payload as any).ctrlKey,
          metaKey: (payload as any).metaKey,
          shiftKey: (payload as any).shiftKey,
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
        dispatched = new MouseEvent(type, {
          clientX: (payload as any).clientX,
          clientY: (payload as any).clientY,
          button: (payload as any).button,
          buttons: (payload as any).buttons,
          altKey: (payload as any).altKey,
          ctrlKey: (payload as any).ctrlKey,
          metaKey: (payload as any).metaKey,
          shiftKey: (payload as any).shiftKey,
          bubbles: true,
          cancelable: true,
        });
      } else if (type.startsWith("pointer")) {
        if (typeof PointerEvent !== "undefined") {
          dispatched = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: (payload as any).clientX,
            clientY: (payload as any).clientY,
          });
        } else {
          dispatched = new Event(type, { bubbles: true, cancelable: true });
        }
      } else if (type === "input" || type === "beforeinput") {
        dispatched = new InputEvent(type, {
          bubbles: true,
          cancelable: true,
          data: (payload as any).data ?? null,
          inputType: (payload as any).inputType ?? "insertText",
          isComposing: (payload as any).isComposing ?? false,
        });
      } else if (
        type === "compositionstart" ||
        type === "compositionupdate" ||
        type === "compositionend"
      ) {
        dispatched = new CompositionEvent(type, {
          bubbles: true,
          cancelable: true,
          data: (payload as any).data ?? null,
        });
      } else {
        dispatched = new Event(type, { bubbles: true, cancelable: true });
      }
      target.dispatchEvent(dispatched);
    }, event);
  };
}
