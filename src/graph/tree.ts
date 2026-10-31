import type { MapNode } from '@/src/db/types';

export interface MapTree {
  node: MapNode;
  children: MapTree[];
}

/** Siblings in map order: by fractional index, ties (a restored node) by id. */
export const byOrder = (a: MapNode, b: MapNode) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1);

/** Builds the trees of a set of live nodes; a node whose parent is not in the set is a root. */
export function buildTree(nodes: MapNode[]): MapTree[] {
  const byId = new Map(nodes.map((n) => [n.id, { node: n, children: [] as MapTree[] }]));
  const roots: MapTree[] = [];
  for (const n of [...nodes].sort(byOrder)) {
    const t = byId.get(n.id)!;
    const parent = n.parentId === undefined ? undefined : byId.get(n.parentId);
    (parent ? parent.children : roots).push(t);
  }
  return roots;
}

export const itemCount = (t: MapTree): number =>
  t.node.kind === 'item' ? 1 : t.children.reduce((sum, c) => sum + itemCount(c), 0);

/** A structure node is grey (not learned yet) while no item lies below it. */
export const isGrey = (t: MapTree): boolean => t.node.kind !== 'item' && itemCount(t) === 0;
