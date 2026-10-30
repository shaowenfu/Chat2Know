// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { parseGraphAddition, parseTags } from '@/src/llm/prompts';
import { conceptKey, hasCycle, levels, prerequisiteClosure } from '@/src/graph/prereq';
import { tagBatch } from '@/src/services/tagging';
import { linkConcepts } from '@/src/services/linking';
import { embedAsks } from '@/src/services/vectors';
import { startMockLlm, type MockLlm } from '../mock-llm/server';

let mock: MockLlm;
let seq = 0;
let db: Chat2KnowDB;
let repo: Repository;
let client: LlmClient;

beforeAll(async () => {
  mock = await startMockLlm();
});
afterAll(() => mock.close());
beforeEach(() => {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  db = new Chat2KnowDB(`tagging-${seq++}`);
  repo = new Repository(db, new Hlc('d', now), now);
  client = new LlmClient({ baseUrl: mock.url, model: 'm', apiKey: 'test-key', embeddingModel: '' });
  mock.requests.length = 0;
});
afterEach(() => db.delete());

const ask = (text: string, conversation = '1') => repo.recordAsk({ site: 'chatgpt', conversationUrl: `https://chatgpt.com/c/${conversation}`, text });
const tasks = () => mock.requests.map((r) => /\[task:(\w+)\]/.exec(r.body.messages![0]!.content)![1]);

describe('concept tagging', () => {
  it('tags a batch, generates a new domain graph once, and extends it later', async () => {
    await ask('Why does the transpose reverse a product?');
    await ask('Thanks, that helps!');
    expect(await tagBatch(repo, client)).toBe(2);
    expect(tasks()).toEqual(['tag', 'prereq']);
    const concepts = await repo.listConcepts();
    expect(concepts.map((c) => c.name).sort()).toEqual(['Matrix basics', 'Matrix multiplication order', 'Matrix operation rules', 'Trace properties', 'Transpose properties']);
    const byName = new Map(concepts.map((c) => [c.name, c.id]));
    const tags = await repo.listAskTags();
    expect(tags.map((t) => t.conceptId)).toEqual([byName.get('Transpose properties')]);
    expect(await repo.untaggedAsks()).toEqual([]); // the chit-chat was looked at too

    // Same domain again: the graph is not regenerated.
    mock.requests.length = 0;
    await ask('How do I take the trace of a product?');
    expect(await tagBatch(repo, client)).toBe(1);
    expect(tasks()).toEqual(['tag']);
    expect(await repo.listConcepts()).toHaveLength(5);

    // A new domain gets its own graph.
    mock.requests.length = 0;
    await ask('How do I take the derivative of x^T A x?');
    await tagBatch(repo, client);
    expect(tasks()).toEqual(['tag', 'prereq']);
    const edges = await repo.listPrereqEdges();
    expect(hasCycle(edges)).toBe(false);
    const level = levels((await repo.listConcepts()).map((c) => c.id), edges);
    const id = new Map((await repo.listConcepts()).map((c) => [c.name, c.id]));
    expect(level.get(id.get('Matrix basics')!)).toBe(0);
    expect(level.get(id.get('Transpose properties')!)).toBe(2);
    expect(level.get(id.get('Matrix derivatives')!)).toBe(2);
    expect([...prerequisiteClosure(id.get('Transpose properties')!, edges)].sort()).toEqual([id.get('Matrix basics'), id.get('Matrix operation rules')].sort());
  });

  it('does nothing without untagged questions', async () => {
    expect(await tagBatch(repo, client)).toBe(0);
    expect(mock.requests).toEqual([]);
  });

  it('deleting a question deletes its tags', async () => {
    const a = await ask('Why does the transpose reverse a product?');
    await tagBatch(repo, client);
    await repo.deleteAsk(a.id);
    expect(await repo.listAskTags()).toEqual([]);
  });
});

describe('linking concepts to note cards', () => {
  async function card(title: string, term?: string) {
    const node = await repo.capture('knowledge', { markdown: title, quote: { exact: title, prefix: '', suffix: '' }, url: 'u', pageTitle: 'p' });
    await repo.confirmTitle(node.id, title);
    if (term) await db.nodes.update(node.id, { term });
    return node.id;
  }

  it('links by name without an embedding model, and by similarity with one', async () => {
    await ask('Why does the transpose reverse a product?');
    await ask('How do I take the trace of a product?');
    await tagBatch(repo, client);
    const transpose = await card('transpose PROPERTIES');
    const trace = await card('Trace properties.'); // not the same name, same words
    const rules = await card('What are the rules?', 'Matrix operation rules');

    mock.requests.length = 0;
    await linkConcepts(repo, client, '');
    expect(mock.requests).toEqual([]);
    let byName = new Map((await repo.listConcepts()).map((c) => [c.name, c.nodeId]));
    expect(byName.get('Transpose properties')).toBe(transpose);
    expect(byName.get('Matrix operation rules')).toBe(rules);
    expect(byName.get('Trace properties')).toBeUndefined();

    const withEmbeddings = new LlmClient({ baseUrl: mock.url, model: 'm', apiKey: 'test-key', embeddingModel: 'mock-embed' });
    await linkConcepts(repo, withEmbeddings, 'mock-embed');
    byName = new Map((await repo.listConcepts()).map((c) => [c.name, c.nodeId]));
    expect(byName.get('Trace properties')).toBe(trace);
    expect(byName.get('Matrix basics')).toBeUndefined(); // nothing similar enough
  });

  it('lists questions with their concept names', async () => {
    await ask('Why does the transpose reverse a product?');
    await tagBatch(repo, client);
    expect((await repo.listAskViews()).map((a) => a.concepts)).toEqual([['Transpose properties']]);
  });
});

describe('question vectors', () => {
  it('are computed once per embedding model and kept out of the list view', async () => {
    await ask('why transpose?');
    await ask('why reverse the order?');
    const c = new LlmClient({ baseUrl: mock.url, model: 'm', apiKey: 'test-key', embeddingModel: 'mock-embed' });
    await embedAsks(repo, c, 'mock-embed', await repo.listAsks());
    await embedAsks(repo, c, 'mock-embed', await repo.listAsks());
    expect(mock.requests.filter((r) => r.path === '/embeddings')).toHaveLength(1);
    expect((await repo.listAsks()).every((a) => a.vector?.length === 64 && a.vectorModel === 'mock-embed')).toBe(true);
    expect(Object.keys((await repo.listAskViews())[0]!)).not.toContain('vector');
  });
});

describe('strict model output', () => {
  it('rejects tags that skip a question', () => {
    expect(() => parseTags({ tags: [{ ask: 1, domain: 'd', concepts: ['c'] }] }, 2)).toThrow('Expected 2 tagged questions, got 1');
  });

  it('rejects a graph that drops a required concept or names an unknown one', () => {
    expect(() => parseGraphAddition({ concepts: ['A'], edges: [] }, [], ['A', 'B'], conceptKey)).toThrow('missing the required concept "B"');
    expect(() => parseGraphAddition({ concepts: ['A'], edges: [{ from: 'X', to: 'A' }] }, [], ['A'], conceptKey)).toThrow('unknown concept "X"');
    // Names match regardless of case.
    expect(parseGraphAddition({ concepts: ['B'], edges: [{ from: 'a', to: 'B' }] }, ['A'], ['b'], conceptKey)).toEqual({ concepts: ['B'], edges: [{ from: 'a', to: 'B' }] });
  });

  it('detects cycles', () => {
    expect(hasCycle([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }])).toBe(true);
    expect(hasCycle([{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'c' }])).toBe(false);
  });
});
