import type { Page } from "@playwright/test";

export type PlaywrightBridgeState = {
  contentSet: boolean;
  installed: boolean;
};

export type PlaywrightBridgeOptions = {
  bindingName: string;
  htmlDocument?: string;
  url?: string;
  state: PlaywrightBridgeState;
};

export async function installPlaywrightBridge(
  page: Page,
  options: PlaywrightBridgeOptions,
  emitInstruction: (instruction: unknown) => void
): Promise<void> {
  if (options.state.installed) {
    return;
  }
  await page.exposeBinding(options.bindingName, (_source, instruction) => {
    emitInstruction(instruction);
  });

  if (!options.state.contentSet && options.htmlDocument) {
    await page.setContent(options.htmlDocument, {
      waitUntil: "domcontentloaded",
    });
    options.state.contentSet = true;
  }

  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    ({ bindingName }) => {
      const bindingTarget = window as unknown as Record<string, unknown>;
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
      const getXPath = (node: Node): string | null => {
        const TEXT_NODE = 3;
        const ELEMENT_NODE = 1;

        if (node.nodeType === TEXT_NODE) {
          const parent = node.parentNode;
          if (!parent) {
            return null;
          }
          const siblings = parent.childNodes;
          let index = 1;
          for (let i = 0; i < siblings.length; i += 1) {
            if (siblings[i] === node) {
              break;
            }
            if (siblings[i].nodeType === TEXT_NODE) {
              index += 1;
            }
          }
          const parentXPath = getXPath(parent);
          if (parentXPath) {
            return `${parentXPath}/text()[${index}]`;
          }
          return null;
        }

        if (node.nodeType !== ELEMENT_NODE) {
          return null;
        }
        const element = node as Element;
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }
        if (element === document.documentElement) {
          return "/html";
        }
        if (element === document.head) {
          return "/html/head";
        }
        if (element === document.body) {
          return "/html/body";
        }
        let ix = 0;
        const siblings = element.parentNode?.childNodes;
        if (!siblings) {
          return null;
        }
        for (let i = 0; i < siblings.length; i += 1) {
          const sibling = siblings[i] as ChildNode;
          if (sibling === element) {
            const parentXPath = getXPath(element.parentNode as Element);
            if (parentXPath) {
              return `${parentXPath}/${element.tagName.toLowerCase()}[${
                ix + 1
              }]`;
            }
            return null;
          }
          if (
            sibling.nodeType === ELEMENT_NODE &&
            (sibling as Element).nodeName === element.nodeName
          ) {
            ix += 1;
          }
        }
        return null;
      };
      const sanitizeElement = (element: Element): Element => {
        const clone = element.cloneNode(true) as Element;
        for (const script of Array.from(clone.querySelectorAll("script"))) {
          script.remove();
        }
        const allElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
        for (const node of allElements) {
          for (const attr of Array.from(node.attributes)) {
            if (shouldSkipAttribute(attr.name, attr.value)) {
              node.removeAttribute(attr.name);
            }
          }
        }
        return clone;
      };
      const hasUnsafeHtml = (html: string): boolean => {
        const lowered = html.toLowerCase();
        if (lowered.includes("<script")) {
          return true;
        }
        if (lowered.includes("javascript:")) {
          return true;
        }
        if (/\son\w+\s*=/.test(lowered)) {
          return true;
        }
        return false;
      };
      const isScriptNode = (node: Node): boolean => {
        if (node instanceof HTMLScriptElement) {
          return node.getAttribute("data-syncui-allow") !== "true";
        }
        if (node instanceof Element) {
          if (node.tagName.toLowerCase() !== "script") {
            return false;
          }
          return node.getAttribute("data-syncui-allow") !== "true";
        }
        return false;
      };
      const stripScriptNodes = (node: Node): Node => {
        if (node instanceof DocumentFragment) {
          for (const script of Array.from(node.querySelectorAll("script"))) {
            script.remove();
          }
        } else if (node instanceof Element) {
          for (const script of Array.from(node.querySelectorAll("script"))) {
            script.remove();
          }
        }
        return node;
      };

      const originalAppendChild = Node.prototype.appendChild;
      Node.prototype.appendChild = function <T extends Node>(
        this: Node,
        child: T
      ): T {
        if (isScriptNode(child)) {
          return child;
        }
        return originalAppendChild.call(this, stripScriptNodes(child)) as T;
      };

      const originalInsertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function <T extends Node>(
        this: Node,
        newChild: T,
        refChild: Node | null
      ): T {
        if (isScriptNode(newChild)) {
          return newChild;
        }
        return originalInsertBefore.call(
          this,
          stripScriptNodes(newChild),
          refChild
        ) as T;
      };

      const originalReplaceChild = Node.prototype.replaceChild;
      Node.prototype.replaceChild = function <T extends Node>(
        this: Node,
        newChild: Node,
        oldChild: T
      ): T {
        if (isScriptNode(newChild)) {
          return oldChild;
        }
        return originalReplaceChild.call(
          this,
          stripScriptNodes(newChild),
          oldChild
        ) as T;
      };

      const originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
      Element.prototype.insertAdjacentHTML = function (
        where: InsertPosition,
        html: string
      ): void {
        if (hasUnsafeHtml(html)) {
          return;
        }
        originalInsertAdjacentHTML.call(this, where, html);
      };

      const emit = (instruction: unknown) => {
        const fn = bindingTarget[bindingName];
        if (typeof fn === "function") {
          fn(instruction);
        }
      };

      const emitSetProperty = (xpath: string, name: string, value: string) => {
        emit(["setProperty", { type: "xpath", xpath }, name, value]);
      };

      const emitSetAttribute = (xpath: string, name: string, value: string) => {
        emit(["setAttribute", { type: "xpath", xpath }, name, value]);
      };

      const emitRemoveAttribute = (xpath: string, name: string) => {
        emit(["removeAttribute", { type: "xpath", xpath }, name]);
      };
      const hasUnsafeNode = (node: Node): boolean => {
        if (node instanceof Element) {
          if (node.tagName.toLowerCase() === "script") {
            return true;
          }
          return node.querySelector("script") !== null;
        }
        if (node instanceof DocumentFragment) {
          return Array.from(node.childNodes).some(hasUnsafeNode);
        }
        return false;
      };
      const handleMutations = (records: MutationRecord[]) => {
        for (const record of records) {
          if (record.type === "attributes") {
            if (!(record.target instanceof Element)) {
              continue;
            }
            const name = record.attributeName;
            if (!name) {
              continue;
            }
            const xpath = getXPath(record.target);
            if (!xpath) {
              continue;
            }
            const value = record.target.getAttribute(name);
            if (value === null || shouldSkipAttribute(name, value)) {
              emitRemoveAttribute(xpath, name);
              continue;
            }
            emitSetAttribute(xpath, name, value);
            continue;
          }

          if (record.type === "characterData") {
            const xpath = getXPath(record.target);
            if (!xpath) {
              continue;
            }
            emitSetProperty(
              xpath,
              "textContent",
              record.target.textContent ?? ""
            );
            continue;
          }

          if (record.type === "childList") {
            if (!(record.target instanceof Element)) {
              continue;
            }
            if (
              record.addedNodes.length > 0 &&
              Array.from(record.addedNodes).some(hasUnsafeNode)
            ) {
              continue;
            }
            const xpath = getXPath(record.target);
            if (!xpath) {
              continue;
            }
            const clone = sanitizeElement(record.target);
            emitSetProperty(xpath, "innerHTML", clone.innerHTML);
          }
        }
      };

      const observer = new MutationObserver(handleMutations);
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
        attributeOldValue: true,
      });
    },
    { bindingName: options.bindingName }
  );
  options.state.installed = true;
}
