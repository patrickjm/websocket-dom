import {
  hasUnsafeHtml,
  isJavascriptUrl,
  sanitizeElement,
  shouldSkipAttribute,
} from "../shared/sanitize";

export { hasUnsafeHtml, sanitizeElement, shouldSkipAttribute, isJavascriptUrl };

export function isScriptElement(element: Element): boolean {
  return element.tagName.toLowerCase() === "script";
}
