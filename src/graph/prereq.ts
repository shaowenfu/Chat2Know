/**
 * The prerequisite graph of concepts (learning diagnosis). An edge `from → to`
 * means `from` must be understood before `to`. Plain functions over id pairs.
 */

export interface Link {
  from: string;
  to: string;
}

/** Concept names are matched without regard to case or spacing. */
export const conceptKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function prerequisitesOf(edges: Link[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) map.set(e.to, [...(map.get(e.to) ?? []), e.from]);
  return map;
}

/** Whether the edges contain a cycle (a concept that is, through others, its own prerequisite). */
export function hasCycle(edges: Link[]): boolean {
  const pre = prerequisitesOf(edges);
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    const cyclic = (pre.get(id) ?? []).some(visit);
    state.set(id, 'done');
    return cyclic;
  };
  return [...pre.keys()].some(visit);
}

/**
 * Level of each concept: 0 when it has no prerequisites, else one more than its
 * highest prerequisite. Higher means more advanced. The graph must be acyclic.
 */
export function levels(ids: string[], edges: Link[]): Map<string, number> {
  const pre = prerequisitesOf(edges);
  const out = new Map<string, number>();
  const level = (id: string): number => {
    const known = out.get(id);
    if (known !== undefined) return known;
    const l = Math.max(-1, ...(pre.get(id) ?? []).map(level)) + 1;
    out.set(id, l);
    return l;
  };
  ids.forEach(level);
  return out;
}

/** Every concept that must be understood before `id`, directly or through others. */
export function prerequisiteClosure(id: string, edges: Link[]): Set<string> {
  const pre = prerequisitesOf(edges);
  const out = new Set<string>();
  for (let frontier = [id]; frontier.length; ) {
    frontier = frontier.flatMap((c) => pre.get(c) ?? []).filter((p) => !out.has(p));
    frontier.forEach((p) => out.add(p));
  }
  return out;
}
