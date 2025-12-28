const urlAttributeNames = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

export function isJavascriptUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith('javascript:');
}

export function shouldSkipAttribute(name: string, value: string): boolean {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('on')) {
    return true;
  }
  if (lowerName === 'srcdoc') {
    return true;
  }
  if (urlAttributeNames.has(lowerName) && isJavascriptUrl(value)) {
    return true;
  }
  return false;
}

export function isScriptElement(element: Element): boolean {
  return element.tagName.toLowerCase() === 'script';
}

export function sanitizeElement(element: Element): Element {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('script').forEach((script) => script.remove());
  const allElements = [clone, ...Array.from(clone.querySelectorAll('*'))];
  allElements.forEach((node) => {
    Array.from(node.attributes).forEach((attr) => {
      if (shouldSkipAttribute(attr.name, attr.value)) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return clone;
}

export function hasUnsafeHtml(html: string): boolean {
  const lowered = html.toLowerCase();
  if (lowered.includes('<script')) {
    return true;
  }
  if (lowered.includes('javascript:')) {
    return true;
  }
  if (/\son\w+\s*=/.test(lowered)) {
    return true;
  }
  return false;
}
