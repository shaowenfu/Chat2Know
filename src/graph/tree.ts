import type { NodeView } from '@/src/db/types';

export interface TreeNode {
  node: NodeView;
  children: TreeNode[];
}

/**
 * Builds the card tree from parent links. Nodes whose parent is not in the set
 * (top level, or parent deleted / not a card) become roots, in input order.
 * Children are ordered by their fractional index.
 */
export function buildTree(nodes: NodeView[]): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, { node: n, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    const item = byId.get(n.id)!;
    const parent = n.parent && byId.get(n.parent.id);
    (parent ? parent.children : roots).push(item);
  }
  for (const item of byId.values()) item.children.sort((a, b) => (a.node.parent!.order < b.node.parent!.order ? -1 : 1));
  return roots;
}
