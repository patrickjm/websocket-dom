import { getElementFromXPath } from "./events";
import { getXPath, type WindowLike } from "../utils";

/** Reference to a node by XPath. */
export interface XPathNodeRef {
  type: 'xpath';
  xpath: string;
}

/** 
 * Reference to a node by its stash ID.
 * Stash IDs are synced between client/server.
 */
export interface StashedIdNodeRef {
  type: 'stashed-id';
  id: number;
}

/** Global reference to a node that should work across client/server. */
export type NodeRef = XPathNodeRef | StashedIdNodeRef;

/** Type of node that can be stashed. */
type StashedNode = Node | Text | DocumentFragment;

// TODO: Use WeakRef for StashedValue and emit events when nodes are removed.
// Then when nodes are removed, stash them.
// This will allow flows like removing an element from one parent and adding it to another.
export class NodeStash {
  private window: WindowLike;
  private nextId = 0;
  private stashed: Map<number, StashedNode> = new Map();
  private lastStashedId = 0;

  constructor(window: WindowLike) {
    this.window = window;
  }

  public stash(node: StashedNode, id?: number): StashedIdNodeRef {
    const _id = id ?? this.nextId;
    this.stashed.set(_id, node);
    this.nextId = _id + 1;
    this.lastStashedId = _id;
    return { type: 'stashed-id', id: _id };
  }

  public peek(): StashedNode | null {
    return this.stashed.get(this.lastStashedId) ?? null;
  }

  public get(id: NodeRef): StashedNode | null {
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

  public findRefFor(node: StashedNode): NodeRef | null {
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