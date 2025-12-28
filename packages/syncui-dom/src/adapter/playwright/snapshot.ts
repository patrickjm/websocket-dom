import type { SnapshotMessage } from "syncui/core/protocol/messages";

export type EvalInPage = <T>(fn: () => T | Promise<T>) => Promise<T>;

export function createSnapshotGetter(evalInPage: EvalInPage) {
  return (): Promise<SnapshotMessage> => {
    return evalInPage(() => {
      const shouldSkipAttribute = (name: string, value: string) => {
        const lower = name.toLowerCase();
        if (lower.startsWith("on")) {
          return true;
        }
        if (lower === "srcdoc") {
          return true;
        }
        if (
          ["href", "src", "action", "formaction", "xlink:href"].includes(lower)
        ) {
          return value.trim().toLowerCase().startsWith("javascript:");
        }
        return false;
      };

      const sanitizeElement = (element: Element): Element => {
        const clone = element.cloneNode(true) as Element;
        clone.querySelectorAll("script").forEach((script) => script.remove());
        const allElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
        allElements.forEach((node) => {
          Array.from(node.attributes).forEach((attr) => {
            if (shouldSkipAttribute(attr.name, attr.value)) {
              node.removeAttribute(attr.name);
            }
          });
        });
        return clone;
      };

      const collectAttributes = (
        element: Element | null
      ): [string, string][] => {
        if (!element) {
          return [];
        }
        const attrs: [string, string][] = [];
        Array.from(element.attributes).forEach((attr) => {
          if (shouldSkipAttribute(attr.name, attr.value)) {
            return;
          }
          attrs.push([attr.name, attr.value]);
        });
        return attrs;
      };

      return {
        type: "snapshot",
        htmlAttributes: collectAttributes(document.documentElement),
        headAttributes: collectAttributes(document.head),
        bodyAttributes: collectAttributes(document.body),
        headHtml: document.head ? sanitizeElement(document.head).innerHTML : "",
        bodyHtml: document.body ? sanitizeElement(document.body).innerHTML : "",
      };
    });
  };
}
