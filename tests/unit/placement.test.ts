import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { suggestPlacement } from '@/src/services/placement';
import { mockEmbedding } from '../mock-llm/server';

let seq = 0;
let db: Chat2KnowDB;
let repo: Repository;
let embedCalls: string[][];
let client: LlmClient;

beforeEach(() => {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  db = new Chat2KnowDB(`place-${seq++}`);
  repo = new Repository(db, new Hlc('d', now), now);
  embedCalls = [];
  const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    const { input } = JSON.parse(init!.body as string) as { input: string[] };
    embedCalls.push(input);
    return new Response(JSON.stringify({ data: input.map((t, index) => ({ index, embedding: mockEmbedding(t) })) }));
  });
  client = new LlmClient({ baseUrl: 'https://m.dev', model: 'm', apiKey: 'k', embeddingModel: 'e' }, fetchFn);
});
afterEach(() => db.delete());

async function card(title: string, summary: string) {
  const n = await repo.capture('knowledge', { markdown: summary, quote: { exact: summary, prefix: '', suffix: '' }, url: 'u', pageTitle: 'p' });
  await repo.setDistillation(n.id, summary, ['a', 'b', 'c']);
  await repo.confirmTitle(n.id, title);
  return n.id;
}

describe('suggestPlacement', () => {
  it('ranks related cards as parents and caches embeddings', async () => {
    const attention = await card('What is attention?', 'Attention weighs tokens by similarity.');
    await card('What is a CPU cache?', 'Caches keep recent memory close to the core.');
    const scaled = await card('Why scale attention scores?', 'Scaling keeps attention softmax from saturating.');
    const p = await suggestPlacement(repo, client, 'e', scaled);
    expect(p.duplicate).toBeUndefined();
    expect(p.parents[0]!.id).toBe(attention);
    expect(p.parents).toHaveLength(2);
    expect(embedCalls).toHaveLength(1);
    await suggestPlacement(repo, client, 'e', scaled);
    expect(embedCalls).toHaveLength(1); // nothing changed: all cached
    await repo.confirmTitle(scaled, 'Why divide attention scores by sqrt(d)?');
    await suggestPlacement(repo, client, 'e', scaled);
    expect(embedCalls.at(-1)).toHaveLength(1); // only the edited card is re-embedded
  });

  it('offers a merge for a near-identical concept', async () => {
    const a = await card('What is a VLM?', 'A VLM combines a vision encoder with a language model.');
    const b = await card('What is a VLM?', 'A VLM combines a vision encoder with a language model.');
    expect((await suggestPlacement(repo, client, 'e', b)).duplicate).toMatchObject({ id: a });
  });

  it('never suggests the card own descendants', async () => {
    const parent = await card('What is attention?', 'Attention weighs tokens.');
    const child = await card('What is attention weighting?', 'Attention weighs tokens by similarity.');
    await repo.moveNode(child, parent);
    expect((await suggestPlacement(repo, client, 'e', parent)).parents).toEqual([]);
  });
});

describe('placement limits', () => {
  it('a card that already has a parent gets no placement suggestions', async () => {
    const a = await card('What is attention?', 'Attention weighs tokens.');
    const b = await card('Why scale attention?', 'Scaling keeps attention stable.');
    await repo.moveNode(b, a);
    expect(await suggestPlacement(repo, client, 'e', b)).toEqual({ parents: [] });
    expect(embedCalls).toHaveLength(0);
  });

  it('embeds a large library in batches', async () => {
    const titles = Array.from({ length: 130 }, (_, i) => `Card ${i}`);
    await repo.addCards(titles.map((t) => ({ title: t, summary: t, quote: '' })));
    const [last] = await repo.addCards([{ title: 'Card query', summary: 'q', quote: '' }]);
    await suggestPlacement(repo, client, 'e', last!);
    expect(embedCalls.map((c) => c.length)).toEqual([128, 3]);
  });
});

describe('mergeInto', () => {
  it('moves sources and children, sums ask counts and removes the duplicate', async () => {
    const target = await card('VLM', 'Vision + language.');
    const dup = await card('VLM again', 'Vision + language.');
    const child = await card('Child', 'c');
    await repo.moveNode(child, dup);
    await repo.mergeInto(dup, target);
    const nodes = await repo.listNodes();
    expect(nodes.find((n) => n.id === dup)).toBeUndefined();
    const t = nodes.find((n) => n.id === target)!;
    expect(t.sources).toHaveLength(2);
    expect(nodes.find((n) => n.id === child)!.parent!.id).toBe(target);
    await expect(repo.mergeInto(target, target)).rejects.toThrow('into itself');
  });
});
