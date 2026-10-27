import type { Mastery, NodeView } from '@/src/db/types';

/** How many cards hang off each card through `child` or `arose_from` edges (what builds on it). */
export function dependents(nodes: NodeView[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const n of nodes) {
    if (n.parent && n.parent.kind !== 'instance_of') count.set(n.parent.id, (count.get(n.parent.id) ?? 0) + 1);
  }
  return count;
}

/**
 * Default mastery requirement, by the plan's rule: knowledge that later
 * learning builds on, or that the user keeps asking about, must be known by
 * heart; an example of a concept only needs to be findable; the rest should
 * be understood. The user confirms or changes it with one click.
 */
export function suggestMastery(node: NodeView, dependentCount: number): Mastery {
  if (node.parent?.kind === 'instance_of') return 'index';
  if (node.askCount >= 3 || dependentCount >= 2) return 'internalize';
  return 'understand';
}

export const REPEAT_ASK_THRESHOLD = 3;
