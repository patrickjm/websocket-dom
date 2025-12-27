import type { DOMWindow } from "jsdom";

export type WindowLike = Window | DOMWindow;

export function getXPath(node: Element | Text, window: WindowLike): XPath | null {
  // Node object not accessible on backend
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  if (node.nodeType === TEXT_NODE) {
    const parent = node.parentNode as Element;
    if (!parent) return null;
    const siblings = parent.childNodes;
    let index = 1;
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i] === node) break;
      if (siblings[i].nodeType === TEXT_NODE) index++;
    }
    const parentXPath = getXPath(parent, window);
    if (parentXPath) {
      return parentXPath + '/text()[' + index + ']';
    }
    return null;
  }

  const element = node as Element;
  if (element.id !== '') {
    return '//*[@id="' + element.id + '"]';
  }
  if (element === window.document.body) {
    return '/html/body';
  }
  let ix = 0;
  const siblings = element.parentNode?.childNodes;
  if (siblings) {
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        const parentXPath = getXPath(element.parentNode as Element, window);
        if (parentXPath) {
          return parentXPath + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        return null;
      }
      if (sibling.nodeType === ELEMENT_NODE && sibling.nodeName === element.nodeName) {
        ix++;
      }
    }
  }
  return null;
}

export function debounce<F extends (...args: any[]) => any>(func: F, wait: number): (...args: Parameters<F>) => void {
  let timeout: ReturnType<typeof setTimeout> | null;
  return function executedFunction(...args: Parameters<F>): void {
    const later = () => {
      if (timeout) clearTimeout(timeout);
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
export type XPath = string;

