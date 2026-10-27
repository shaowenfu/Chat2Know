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
    file.nodes.push({ id: 'n1', type: 'knowledge', title: 't', status: 'draft', askCount: 0, createdAt: 1, updatedAt: Hlc.format(9_999_999_999_999, 5, 'other') });
    await repo.importData(file);
    const view = await repo.capture('knowledge', capture('y'));
    expect(view.updatedAt > file.nodes[0]!.updatedAt).toBe(true);
  });
});

describe('askLater', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => ({ db, repo } = setup('ask')));
  afterEach(() => db.delete());

  const ask = (term: string, question: string, url = 'https://example.com/chat') =>
    repo.askLater({ term, question, capture: { ...capture(`${term} is in this sentence.`), url } });

  it('creates an open question node with its sentence as source', async () => {
    const res = await ask('VLM', 'What is VLM?');
    expect(res).toMatchObject({ askCount: 1, merged: false });
    const node = await db.nodes.get(res.nodeId);
    expect(node).toMatchObject({ type: 'question', status: 'open', title: 'What is VLM?', originalAsk: 'What is VLM?', term: 'VLM', askCount: 1 });
  });

  it('allows saving without a question and filling it in later', async () => {
    const { nodeId } = await ask('softmax', '');
    expect(await db.nodes.get(nodeId)).toMatchObject({ title: '' });
    expect((await db.nodes.get(nodeId))!.originalAsk).toBeUndefined();
    await repo.updateQuestion(nodeId, 'Why softmax here?');
    expect(await db.nodes.get(nodeId)).toMatchObject({ title: 'Why softmax here?', originalAsk: 'Why softmax here?' });
  });

  it('merges repeated asks about the same open term and counts them', async () => {
    const first = await ask('VLM', '');
    await ask('vlm', 'What is a VLM?', 'https://other.dev/page');
    const third = await ask('VLM ', 'ignored, first question wins');
    expect(third).toEqual({ nodeId: first.nodeId, askCount: 3, merged: true });
    expect(await db.nodes.get(first.nodeId)).toMatchObject({ title: 'What is a VLM?', askCount: 3 });
    expect(await db.sources.where('nodeId').equals(first.nodeId).count()).toBe(3);
  });

  it('starts a new question once the old one is resolved', async () => {
    const first = await ask('VLM', '');
    await repo.deleteNode(first.nodeId);
    expect((await ask('VLM', '')).merged).toBe(false);
  });

  it('lists open questions on a page for underlining, ignoring the hash', async () => {
    const { nodeId } = await ask('VLM', '');
    await ask('LLM', '', 'https://elsewhere.dev');
    expect(await repo.questionsForUrl('https://example.com/chat#section')).toEqual([
      { nodeId, term: 'VLM', quote: { exact: 'VLM is in this sentence.', prefix: 'before ', suffix: ' after' } },
    ]);
  });
});

describe('schema migration', () => {
  it('upgrades v1 databases, defaulting askCount to 0', async () => {
    const name = `migrate-${seq++}`;
    const { default: Dexie } = await import('dexie');
    const v1 = new Dexie(name);
    v1.version(1).stores({ nodes: 'id, type, status, createdAt' });
    await v1.table('nodes').add({ id: 'old', type: 'knowledge', title: 'x', status: 'draft', createdAt: 1, updatedAt: 'a' });
    v1.close();
    const db = new Chat2KnowDB(name);
    expect(await db.nodes.get('old')).toMatchObject({ askCount: 0 });
    expect(await db.inbox.count()).toBe(0);
    await db.delete();
  });

  it('imports v1 exports that lack askCount', async () => {
    const { db, repo } = setup('legacy');
    await repo.importData({
      format: 'chat2know', version: 1, exportedAt: 0, edges: [], sources: [], reviews: [],
      nodes: [{ id: 'n', type: 'knowledge', title: 't', status: 'draft', createdAt: 1, updatedAt: 'a' }],
    });
    expect(await db.nodes.get('n')).toMatchObject({ askCount: 0 });
    await db.delete();
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
