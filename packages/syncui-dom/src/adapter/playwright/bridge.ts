import type { Page } from "@playwright/test";

export type PlaywrightBridgeState = {
  contentSet: boolean;
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
      const globalAny = window as any;
      if (globalAny.__syncuiPlaywrightBridge) {
        return;
      }

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
          node.querySelectorAll("script").forEach((script) => script.remove());
        } else if (node instanceof Element) {
          node.querySelectorAll("script").forEach((script) => script.remove());
        }
        return node;
      };

      const originalAppendChild = Node.prototype.appendChild;
      (Node.prototype as any).appendChild = function (child: Node): Node {
        if (isScriptNode(child)) {
          return child;
        }
        return originalAppendChild.call(this, stripScriptNodes(child));
      };

      const originalInsertBefore = Node.prototype.insertBefore;
      (Node.prototype as any).insertBefore = function (
        newChild: Node,
        refChild: Node | null
      ): Node {
        if (isScriptNode(newChild)) {
          return newChild;
        }
        return originalInsertBefore.call(
          this,
          stripScriptNodes(newChild),
          refChild
        );
      };

      const originalReplaceChild = Node.prototype.replaceChild;
      (Node.prototype as any).replaceChild = function (
        newChild: Node,
        oldChild: Node
      ): Node {
        if (isScriptNode(newChild)) {
          return newChild;
        }
        return originalReplaceChild.call(
          this,
          stripScriptNodes(newChild),
          oldChild
        );
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
        const fn = globalAny[bindingName];
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
        records.forEach((record) => {
          if (record.type === "attributes") {
            if (!(record.target instanceof Element)) {
              return;
            }
            const name = record.attributeName;
            if (!name) {
              return;
            }
            const xpath = getXPath(record.target);
            if (!xpath) {
              return;
            }
            const value = record.target.getAttribute(name);
            if (value === null || shouldSkipAttribute(name, value)) {
              emitRemoveAttribute(xpath, name);
              return;
            }
            emitSetAttribute(xpath, name, value);
            return;
          }

          if (record.type === "characterData") {
            const xpath = getXPath(record.target);
            if (!xpath) {
              return;
            }
            emitSetProperty(xpath, "textContent", record.target.textContent ?? "");
            return;
          }

          if (record.type === "childList") {
            if (!(record.target instanceof Element)) {
              return;
            }
            if (
              record.addedNodes.length > 0 &&
              Array.from(record.addedNodes).some(hasUnsafeNode)
            ) {
              return;
            }
            const xpath = getXPath(record.target);
            if (!xpath) {
              return;
            }
            const clone = sanitizeElement(record.target);
            emitSetProperty(xpath, "innerHTML", clone.innerHTML);
          }
        });
      };

      const observer = new MutationObserver(handleMutations);
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
        attributeOldValue: true,
      });

      globalAny.__syncuiPlaywrightBridge = {
        observer,
        emitInstruction: emit,
        getXPath,
      };
    },
    { bindingName: options.bindingName }
  );
}
