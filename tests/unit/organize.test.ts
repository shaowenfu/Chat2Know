import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { MAX_ORGANIZE_CHARS, organize } from '@/src/services/organize';

const reply = (content: unknown) =>
  new LlmClient(
    { baseUrl: 'https://m.dev', model: 'm', apiKey: 'k', embeddingModel: '' },
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))),
  );

describe('organize', () => {
  it('returns validated candidate cards', async () => {
    const cards = [{ question: 'Why scale?', summary: 'To avoid saturation.', quote: 'scaling factor keeps the softmax' }];
    expect(await organize(reply({ cards }), 'some conversation')).toEqual(cards);
    expect(await organize(reply({ cards: [] }), 'small talk')).toEqual([]);
  });

  it('rejects malformed output, empty and oversized input', async () => {
    await expect(organize(reply({ cards: [{ question: 'q' }] }), 'x')).rejects.toThrow('Expected non-empty string "summary"');
    await expect(organize(reply({}), 'x')).rejects.toThrow('Expected "cards" to be a list');
    await expect(organize(reply({ cards: [] }), '   ')).rejects.toThrow('Nothing to organize');
    await expect(organize(reply({ cards: [] }), 'a'.repeat(MAX_ORGANIZE_CHARS + 1))).rejects.toThrow('too long');
  });
});

describe('addCards', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`org-${Math.random()}`);
    repo = new Repository(db, new Hlc('d', now), now);
  });
  afterEach(() => db.delete());

  it('creates confirmed cards with the quote as provenance', async () => {
    const ids = await repo.addCards([{ title: 'Why scale?', summary: 'Avoid saturation.', quote: 'scaling keeps softmax' }], { url: 'https://c.dev', pageTitle: 'Chat' });
    const [node] = await repo.listNodes();
    expect(node).toMatchObject({ id: ids[0], type: 'knowledge', status: 'confirmed', title: 'Why scale?', summary: 'Avoid saturation.', body: 'scaling keeps softmax' });
    expect(node!.sources[0]).toMatchObject({ url: 'https://c.dev', quoteExact: 'scaling keeps softmax' });
  });

  it('pasted cards have no source; a blank title aborts the whole batch', async () => {
    await repo.addCards([{ title: 'Q', summary: 'S', quote: 'q' }]);
    expect((await repo.listNodes())[0]!.sources).toEqual([]);
    await expect(repo.addCards([{ title: 'ok', summary: 's', quote: '' }, { title: ' ', summary: 's', quote: '' }])).rejects.toThrow('required');
    expect(await repo.listNodes()).toHaveLength(1);
  });
});
