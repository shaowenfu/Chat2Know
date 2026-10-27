import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { buildTree, type TreeNode } from '@/src/graph/tree';

let seq = 0;
let db: Chat2KnowDB;
let repo: Repository;

beforeEach(() => {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  db = new Chat2KnowDB(`tree-${seq++}`);
  repo = new Repository(db, new Hlc('d', now), now);
});
afterEach(() => db.delete());

const card = async (title: string) =>
  (await repo.capture('idea', { markdown: title, quote: { exact: title, prefix: '', suffix: '' }, url: 'u', pageTitle: 'p' })).id;

const shape = (items: TreeNode[]): unknown => items.map((i) => (i.children.length ? { [i.node.title]: shape(i.children) } : i.node.title));
const tree = async () => shape(buildTree(await repo.listNodes()));

describe('moveNode and buildTree', () => {
  it('nests, orders siblings and keeps order after reload', async () => {
    const a = await card('A');
    const b = await card('B');
    const c = await card('C');
    const d = await card('D');
    expect(await tree()).toEqual(['D', 'C', 'B', 'A']); // roots newest first
    await repo.moveNode(b, a);
    await repo.moveNode(c, a);
    await repo.moveNode(d, a, b); // before B
    expect(await tree()).toEqual([{ A: ['D', 'B', 'C'] }]);
    await repo.moveNode(c, a, d); // reorder: C first
    expect(await tree()).toEqual([{ A: ['C', 'D', 'B'] }]);
    const edges = await db.edges.toArray();
    expect(edges).toHaveLength(3);
  });

  it('refuses cycles and moves back to the top level', async () => {
    const a = await card('A');
    const b = await card('B');
    await repo.moveNode(b, a);
    await expect(repo.moveNode(a, b)).rejects.toThrow('cannot be moved under itself');
    await expect(repo.moveNode(a, a)).rejects.toThrow('cannot be moved under itself');
    await repo.moveNode(b, null);
    expect(await tree()).toEqual(['B', 'A']);
  });

  it('children of a deleted card surface at the top level', async () => {
    const a = await card('A');
    const b = await card('B');
    await repo.moveNode(b, a);
    await repo.deleteNode(a);
    expect(await tree()).toEqual(['B']);
  });

  it('keeps the relation kind when reordering under the same parent', async () => {
    const concept = await card('VLM');
    const x = await card('X');
    const y = await card('Y');
    await repo.moveNode(x, concept);
    await db.edges.where('to').equals(x).modify({ kind: 'instance_of' });
    await repo.moveNode(y, concept);
    await repo.moveNode(x, concept, undefined); // move to the end, same parent
    expect((await db.edges.where('to').equals(x).first())!.kind).toBe('instance_of');
    await repo.moveNode(x, y);
    expect((await db.edges.where('to').equals(x).first())!.kind).toBe('child');
  });

  it('rejects a sibling that is not under the target parent', async () => {
    const a = await card('A');
    const b = await card('B');
    await expect(repo.moveNode(b, a, 'nope')).rejects.toThrow('Sibling not found');
  });
});
