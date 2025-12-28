import type { XPath } from "../../shared-utils";

export function getElementFromXPath(
  xpath: XPath,
  document: Document
): HTMLElement | null {
  if (xpath === "/html") {
    return document.documentElement;
  }
  if (xpath === "/html/head") {
    return document.head;
  }
  if (xpath === "/html/body") {
    return document.body;
  }
  const FIRST_ORDERED_NODE_TYPE = 9;
  return document.evaluate(xpath, document, null, FIRST_ORDERED_NODE_TYPE, null)
    .singleNodeValue as HTMLElement;
}
