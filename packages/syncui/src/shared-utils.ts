export type WindowLike = { document: Document };

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function getXPath(
  node: Element | Text,
  window: WindowLike
): XPath | null {
  if (node.nodeType === TEXT_NODE) {
    return getTextXPath(node as Text, window);
  }
  return getElementXPath(node as Element, window);
}

const getTextXPath = (node: Text, window: WindowLike): XPath | null => {
  const parent = node.parentNode as Element | null;
  if (!parent) {
    return null;
  }
  const index = getNodeIndex(parent.childNodes, node, TEXT_NODE);
  const parentXPath = getXPath(parent, window);
  return parentXPath ? `${parentXPath}/text()[${index}]` : null;
};

const getElementXPath = (
  element: Element,
  window: WindowLike
): XPath | null => {
  if (element.id !== "") {
    return `//*[@id="${element.id}"]`;
  }
  if (element === window.document.body) {
    return "/html/body";
  }
  const parent = element.parentNode as Element | null;
  if (!parent) {
    return null;
  }
  const index = getNodeIndex(
    parent.childNodes,
    element,
    ELEMENT_NODE,
    element.nodeName
  );
  const parentXPath = getXPath(parent, window);
  return parentXPath
    ? `${parentXPath}/${element.tagName.toLowerCase()}[${index}]`
    : null;
};

const getNodeIndex = (
  siblings: NodeListOf<ChildNode>,
  node: Node,
  nodeType: number,
  nodeName?: string
): number => {
  let index = 1;
  for (const sibling of Array.from(siblings)) {
    if (sibling === node) {
      break;
    }
    if (
      sibling.nodeType === nodeType &&
      (!nodeName || (sibling as Element).nodeName === nodeName)
    ) {
      index += 1;
    }
  }
  return index;
};

export function debounce<Args extends unknown[], R>(
  func: (...args: Args) => R,
  wait: number
): (...args: Args) => void {
  let timeout: ReturnType<typeof setTimeout> | null;
  return function executedFunction(...args: Args): void {
    const later = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      func(...args);
    };
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
export type XPath = string;
