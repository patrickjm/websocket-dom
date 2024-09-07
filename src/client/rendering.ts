import { Nodes, type StashedIdNodeRef } from "../dom/nodes";
import { InstructionType, type Deserialized } from "../dom/types";

export function resolveXPath(xpath: string): Element | null {
  return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null;
}

export function applyInstruction(instruction: Deserialized.Instruction, nodes: Nodes): void {
  switch (instruction.type) {
    case InstructionType.CreateElement:
      const createElement = document.createElement(instruction.tagName, { is: instruction.is });
      nodes.stash(createElement, instruction.refId);
      break;
    case InstructionType.SetAttribute:
      const setAttrElement = nodes.get(instruction.ref);
      if (setAttrElement && setAttrElement instanceof Element) {
        setAttrElement.setAttribute(instruction.name, instruction.value);
      }
      break;
    case InstructionType.SetProperty:
      const setPropElement = nodes.get(instruction.ref);
      if (setPropElement && setPropElement instanceof Element) {
        // @ts-ignore
        setPropElement[instruction.name] = instruction.value;
      }
      break;
    case InstructionType.AppendChild:
      const appendChildParent = nodes.get(instruction.parent);
      const appendChildChild = nodes.get(instruction.child);
      if (appendChildParent && appendChildParent instanceof Element && appendChildChild) {
        nodes.unstash(instruction.child as StashedIdNodeRef);
        appendChildParent.appendChild(appendChildChild);
      }
      break;
  }
}