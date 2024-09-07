import { getElementFromXPath } from "./events";
import { getXPath, type WindowLike } from "../utils";

export interface XPathNodeRef {
  type: 'xpath';
  xpath: string;
}

export interface StashedIdNodeRef {
  type: 'stashed-id';
  id: number;
}

export type NodeRef = XPathNodeRef | StashedIdNodeRef;

type StashedValue = Node | Text;

export class Nodes {
  private window: WindowLike;
  private nextId = 0;
  private stashed: Map<number, StashedValue> = new Map();

  constructor(window: WindowLike) {
    this.window = window;
  }

  public stash(node: StashedValue, id?: number): StashedIdNodeRef {
    const _id = id ?? this.nextId;
    this.stashed.set(_id, node);
    this.nextId = _id + 1;
    return { type: 'stashed-id', id: _id };
  }

  public get(id: NodeRef): StashedValue | null {
    if (id.type === 'stashed-id') {
      return this.stashed.get(id.id) ?? null;
    } else if (id.type === 'xpath') {
      return getElementFromXPath(id.xpath, this.window.document) ?? null;
    }
    throw new Error('Unknown node ref type: ' + id);
  }

  public unstash(id: StashedIdNodeRef): void {
    this.stashed.delete(id.id);
  }

  public findRefFor(node: StashedValue): NodeRef | null {
    for (const [id, stashed] of this.stashed.entries()) {
      if (stashed === node || stashed.isSameNode(node)) {
        return { type: 'stashed-id', id };
      }
    }
    const xpath = getXPath(node as Element, this.window);
    if (xpath) {
      return { type: 'xpath', xpath };
    }
    return null;
  }
}