import { describe, expect, it } from 'vitest';
import { dependents, suggestMastery } from '@/src/graph/mastery';
import type { NodeView } from '@/src/db/types';

const node = (id: string, extra: Partial<NodeView> = {}): NodeView => ({
  id,
  type: 'knowledge',
  title: id,
  status: 'confirmed',
  askCount: 0,
  createdAt: 0,
  updatedAt: '',
  sources: [],
  ...extra,
});

describe('mastery suggestion', () => {
  it('counts child and arose_from dependents, not instances', () => {
    const nodes = [
      node('A'),
      node('B', { parent: { id: 'A', kind: 'child', order: 'a0' } }),
      node('C', { parent: { id: 'A', kind: 'arose_from', order: 'a1' } }),
      node('D', { parent: { id: 'A', kind: 'instance_of', order: 'a2' } }),
    ];
    expect(dependents(nodes)).toEqual(new Map([['A', 2]]));
  });

  it('internalize what others build on or what is asked about repeatedly', () => {
    expect(suggestMastery(node('A'), 2)).toBe('internalize');
    expect(suggestMastery(node('A', { askCount: 3 }), 0)).toBe('internalize');
    expect(suggestMastery(node('A', { askCount: 2 }), 1)).toBe('understand');
  });

  it('an instance only needs to be findable', () => {
    expect(suggestMastery(node('X', { askCount: 5, parent: { id: 'C', kind: 'instance_of', order: 'a0' } }), 3)).toBe('index');
  });
});
