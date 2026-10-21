import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository, parseExport } from '@/src/db/repository';
import type { CapturedSelection } from '@/src/capture/selection';

let seq = 0;
const capture = (markdown: string, exact = markdown): CapturedSelection => ({
  markdown,
  quote: { exact, prefix: 'before ', suffix: ' after' },
  url: 'https://example.com/chat',
  pageTitle: 'Example chat',
});

function setup(name: string) {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  const db = new Chat2KnowDB(`${name}-${seq++}`);
  return { db, repo: new Repository(db, new Hlc('dev1', now), now) };
}

describe('Repository', () => {
  let db: Chat2KnowDB;
  let repo: Repository;

  beforeEach(() => ({ db, repo } = setup('repo')));
  afterEach(() => db.delete());

  it('captures a node with its source and logs both writes', async () => {
    const view = await repo.capture('knowledge', capture('## Attention\n\nWeights inputs.'));
    expect(view).toMatchObject({ type: 'knowledge', title: 'Attention', status: 'draft', body: '## Attention\n\nWeights inputs.' });
    expect(view.sources[0]).toMatchObject({ nodeId: view.id, quoteExact: '## Attention\n\nWeights inputs.', quotePrefix: 'before ' });
    const log = await db.oplog.toArray();
    expect(log.map((e) => [e.entity, e.op])).toEqual([
      ['nodes', 'put'],
      ['sources', 'put'],
    ]);
    expect(log[0]!.id < log[1]!.id).toBe(true);
  });

  it('lists live nodes newest first and hides soft-deleted ones', async () => {
    const a = await repo.capture('knowledge', capture('first'));
    const b = await repo.capture('idea', capture('second'));
    expect((await repo.listNodes()).map((n) => n.id)).toEqual([b.id, a.id]);
    await repo.deleteNode(b.id);
    expect((await repo.listNodes()).map((n) => n.id)).toEqual([a.id]);
    expect((await db.nodes.get(b.id))?.deletedAt).toBeTypeOf('number');
    expect((await db.oplog.where('entityId').equals(b.id).toArray()).map((e) => e.op)).toEqual(['put', 'delete']);
  });

  it('round-trips export and import without loss', async () => {
    await repo.capture('knowledge', capture('Formula $E=mc^2$\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'));
    const deleted = await repo.capture('idea', capture('gone'));
    await repo.deleteNode(deleted.id);
    const exported = await repo.exportData();

    const other = setup('import');
    const json = JSON.stringify(exported);
    expect(await other.repo.importData(json)).toEqual({ nodes: 2, edges: 0, sources: 2, reviews: 0 });
    const reexported = await other.repo.exportData();
    expect({ ...reexported, exportedAt: 0 }).toEqual({ ...exported, exportedAt: 0 });
    await other.db.delete();
  });

  it('import is idempotent', async () => {
    await repo.capture('knowledge', capture('x'));
    const file = await repo.exportData();
    await repo.importData(file);
    await repo.importData(file);
    expect(await db.nodes.count()).toBe(1);
  });

  it('later local writes sort after imported clocks', async () => {
    const file = await repo.exportData();
    file.nodes.push({ id: 'n1', type: 'knowledge', title: 't', status: 'draft', createdAt: 1, updatedAt: Hlc.format(9_999_999_999_999, 5, 'other') });
    await repo.importData(file);
    const view = await repo.capture('knowledge', capture('y'));
    expect(view.updatedAt > file.nodes[0]!.updatedAt).toBe(true);
  });
});

describe('parseExport', () => {
  it('rejects foreign or malformed files', () => {
    expect(() => parseExport('{}')).toThrow('Not a Chat2Know export');
    expect(() => parseExport({ format: 'chat2know', version: 99 })).toThrow('Unsupported export version');
    expect(() => parseExport({ format: 'chat2know', version: 1, nodes: [{}], edges: [], sources: [], reviews: [] })).toThrow('Invalid "nodes"');
    expect(() => parseExport('not json')).toThrow();
  });
});

describe('Hlc', () => {
  it('is strictly increasing even when the wall clock stalls or goes back', () => {
    const times = [5, 5, 4, 6];
    const clock = new Hlc('d', () => times.shift() ?? 6);
    const ticks = [clock.tick(), clock.tick(), clock.tick(), clock.tick()];
    expect([...ticks].sort()).toEqual(ticks);
    expect(new Set(ticks).size).toBe(4);
  });
});
