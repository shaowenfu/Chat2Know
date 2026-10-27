import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { INBOX_TTL_MS, Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { answerQuestion, confirmKeep, dismissQuestion, suggestKeep } from '@/src/services/ask';
import { Distiller } from '@/src/services/distill';
import type { Suggestion } from '@/src/llm/prompts';

let seq = 0;
let t: number;
let db: Chat2KnowDB;
let repo: Repository;

/** A client whose model always replies with `content` (string or JSON-able), recording the prompts. */
function clientReplying(content: unknown | ((prompt: string) => unknown)) {
  const prompts: string[] = [];
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string) as { messages: { content: string }[] };
    const prompt = body.messages.map((m) => m.content).join('\n');
    prompts.push(prompt);
    const value = typeof content === 'function' ? (content as (p: string) => unknown)(prompt) : content;
    if (value instanceof Error) return new Response(JSON.stringify({ error: { message: value.message } }), { status: 500 });
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
  return { client: new LlmClient({ baseUrl: 'https://m.dev/v1', model: 'm', apiKey: 'k', embeddingModel: '' }, fetchFn), prompts };
}

const capture = (sentence: string) => ({
  markdown: sentence,
  quote: { exact: sentence, prefix: '', suffix: '' },
  url: 'https://chat.dev/c/1',
  pageTitle: 'Chat',
});

beforeEach(() => {
  t = 1_700_000_000_000;
  const now = () => (t += 1000);
  db = new Chat2KnowDB(`svc-${seq++}`);
  repo = new Repository(db, new Hlc('d', now), now);
});
afterEach(() => db.delete());

async function answered(term: string, question: string) {
  const { nodeId } = await repo.askLater({ term, question, capture: capture(`${term} appears in this sentence.`) });
  const { client } = clientReplying(`An answer about ${term}.`);
  return answerQuestion(repo, client, nodeId, (x) => `What is ${x}?`);
}

const concept: Suggestion = { kind: 'concept', titles: ['A?', 'B?', 'C?'], summary: 'Statement.' };

describe('answerQuestion', () => {
  it('stores the answer in the inbox for 7 days and keeps the question open', async () => {
    const { nodeId } = await repo.askLater({ term: 'VLM', question: '', capture: capture('A VLM reads images.') });
    const { client, prompts } = clientReplying('VLMs combine vision and language.');
    const item = await answerQuestion(repo, client, nodeId, (x) => `What is ${x}?`);
    expect(item).toMatchObject({ questionNodeId: nodeId, question: 'What is VLM?', quote: 'A VLM reads images.', answer: 'VLMs combine vision and language.' });
    expect(item.expiresAt - item.createdAt).toBe(INBOX_TTL_MS);
    expect(prompts[0]).toContain('> A VLM reads images.');
    expect((await repo.getNode(nodeId))!.status).toBe('open');
  });

  it('propagates model errors and stores nothing', async () => {
    const { nodeId } = await repo.askLater({ term: 'x', question: 'Why x?', capture: capture('x.') });
    const { client } = clientReplying(new Error('quota exceeded'));
    await expect(answerQuestion(repo, client, nodeId, (x) => x)).rejects.toThrow('HTTP 500: quota exceeded');
    expect(await repo.listInbox()).toEqual([]);
  });
});

describe('follow-ups', () => {
  it('creates a child question that arose from the card and answers it in that context', async () => {
    const card = await repo.capture('idea', capture('Attention weighs tokens.'));
    await repo.setDistillation(card.id, 'Attention mixes values by similarity.', ['a', 'b', 'c']);
    const child = await repo.askFollowUp(card.id, 'Why softmax?');
    expect(child).toMatchObject({ type: 'question', status: 'open', title: 'Why softmax?', originalAsk: 'Why softmax?' });
    expect(await db.edges.toArray()).toMatchObject([{ from: card.id, to: child.id, kind: 'arose_from' }]);
    const { client, prompts } = clientReplying('Because it normalizes.');
    const item = await answerQuestion(repo, client, child.id, (x) => x);
    expect(item.quote).toBe('Attention mixes values by similarity.');
    expect(prompts[0]).toContain('I was exploring: Attention weighs tokens.');
  });

  it('keeping a follow-up keeps it under its parent', async () => {
    const card = await repo.capture('idea', capture('Parent card.'));
    const child = await repo.askFollowUp(card.id, 'Child?');
    const item = await answerQuestion(repo, clientReplying('ans').client, child.id, (x) => x);
    await repo.keep(item.id, { title: 'Child?', summary: 'S.' });
    expect((await repo.listNodes()).find((n) => n.id === child.id)!.parent).toMatchObject({ id: card.id, kind: 'arose_from' });
  });

  it('rejects empty follow-ups and unknown parents', async () => {
    await expect(repo.askFollowUp('nope', 'q')).rejects.toThrow('not found');
    const card = await repo.capture('idea', capture('x'));
    await expect(repo.askFollowUp(card.id, '  ')).rejects.toThrow('error.questionEmpty');
  });
});

describe('inbox', () => {
  it('purges expired answers when listed', async () => {
    await answered('VLM', '');
    t += INBOX_TTL_MS + 5000;
    expect(await repo.listInbox()).toEqual([]);
  });
});

describe('keep', () => {
  it('suggests with the user’s recent decisions as examples', async () => {
    const item = await answered('VLM', 'What is a VLM?');
    await repo.addPreference({ questionType: 'instance', suggestion: 'Org of X — made by Y', userAction: 'delete' });
    const { client, prompts } = clientReplying(concept);
    expect(await suggestKeep(repo, client, item.id)).toEqual(concept);
    expect(prompts[0]).toContain('[instance] suggested: Org of X — made by Y → delete');
  });

  it('rejects malformed suggestions instead of guessing', async () => {
    const item = await answered('VLM', '');
    const { client } = clientReplying({ kind: 'concept', titles: ['only one'], summary: 's' });
    await expect(suggestKeep(repo, client, item.id)).rejects.toThrow('Expected 3 items in "titles"');
  });

  it('promotes a concept and records acceptance', async () => {
    const item = await answered('VLM', '');
    const node = await confirmKeep(repo, item.id, concept, { title: 'B?', summary: 'Statement.' });
    expect(node).toMatchObject({ id: item.questionNodeId, type: 'knowledge', title: 'B?', summary: 'Statement.', status: 'confirmed' });
    expect((await repo.getInboxItem(item.id)).promotedNodeId).toBe(node.id);
    expect(await repo.recentPreferences(5)).toMatchObject([{ questionType: 'concept', userAction: 'accept' }]);
  });

  it('records edits with the final text', async () => {
    const item = await answered('VLM', '');
    await confirmKeep(repo, item.id, concept, { title: 'My own?', summary: 'Mine.' });
    expect(await repo.recentPreferences(5)).toMatchObject([{ userAction: 'edit', finalText: 'My own? — Mine.' }]);
  });

  it('hangs an instance under its concept, reusing an existing concept node', async () => {
    const vlm = await answered('VLM', '');
    const vlmNode = await confirmKeep(repo, vlm.id, concept, { title: 'VLM', summary: 'Vision + language.' });
    const item = await answered('InternVL3.5', '');
    const instance: Suggestion = { kind: 'instance', titles: ['Which concept?', 'b', 'c'], summary: 'An example of a VLM.', concept: 'vlm' };
    const node = await confirmKeep(repo, item.id, instance, { title: 'Which concept?', summary: 'An example of a VLM.', concept: 'vlm' });
    expect(node.mastery).toBe('index');
    expect(await db.edges.toArray()).toMatchObject([{ from: vlmNode.id, to: node.id, kind: 'instance_of' }]);
  });

  it('creates a topic node for an unknown concept', async () => {
    const item = await answered('InternVL3.5', '');
    await repo.keep(item.id, { title: 'q', summary: 's', concept: 'VLM' });
    expect(await db.nodes.where('type').equals('topic').toArray()).toMatchObject([{ title: 'VLM', status: 'confirmed' }]);
  });

  it('keeping one answer accounts for every answer to that question', async () => {
    const first = await answered('VLM', '');
    const second = await answerQuestion(repo, clientReplying('Second answer.').client, first.questionNodeId, (x) => x);
    await repo.keep(second.id, { title: 'T1', summary: 'S1' });
    expect((await repo.listInbox()).every((i) => i.promotedNodeId === first.questionNodeId)).toBe(true);
  });

  it('can still keep an answer after dismissing its question', async () => {
    const item = await answered('VLM', '');
    await dismissQuestion(repo, item.questionNodeId, concept);
    expect((await repo.getNode(item.questionNodeId))!.deletedAt).toBeDefined();
    expect(await repo.recentPreferences(5)).toMatchObject([{ userAction: 'delete' }]);
    const node = await repo.keep(item.id, { title: 'A?', summary: 'S.' });
    expect(node.deletedAt).toBeUndefined();
    expect((await repo.getNode(node.id))!.deletedAt).toBeUndefined();
  });

  it('treats dismissing a curiosity as agreement', async () => {
    const item = await answered('name', '');
    await dismissQuestion(repo, item.questionNodeId, { ...concept, kind: 'curiosity' });
    expect(await repo.recentPreferences(5)).toMatchObject([{ questionType: 'curiosity', userAction: 'accept' }]);
  });
});

describe('Distiller', () => {
  const card = () => repo.capture('knowledge', capture('Attention weighs tokens. More detail follows.'));

  it('stores summary and title candidates; the card stays draft until a title is picked', async () => {
    const node = await card();
    const { client } = clientReplying({ titles: ['Q1?', 'Q2?', 'Q3?'], summary: 'Attention weighs tokens.' });
    const onChange = vi.fn();
    await new Distiller(repo, async () => client, onChange).distill(node.id);
    expect(await repo.getNode(node.id)).toMatchObject({ status: 'draft', summary: 'Attention weighs tokens.', titleCandidates: ['Q1?', 'Q2?', 'Q3?'] });
    expect(onChange).toHaveBeenCalled();
    await repo.confirmTitle(node.id, 'Q2?');
    const done = (await repo.getNode(node.id))!;
    expect(done).toMatchObject({ status: 'confirmed', title: 'Q2?' });
    expect(done.titleCandidates).toBeUndefined();
  });

  it('records failures on the card and retries cleanly', async () => {
    const node = await card();
    let fail = true;
    const { client } = clientReplying(() => (fail ? new Error('rate limited') : { titles: ['a', 'b', 'c'], summary: 's' }));
    const distiller = new Distiller(repo, async () => client, () => {});
    await distiller.distill(node.id);
    expect((await repo.getNode(node.id))!.distillError).toBe('HTTP 500: rate limited');
    expect(await repo.pendingDistills()).toEqual([]);
    fail = false;
    await distiller.retry(node.id);
    const after = (await repo.getNode(node.id))!;
    expect(after.distillError).toBeUndefined();
    expect(after.summary).toBe('s');
  });

  it('concurrent distill calls for one card make one model request', async () => {
    const node = await card();
    const { client, prompts } = clientReplying({ titles: ['a', 'b', 'c'], summary: 's' });
    const distiller = new Distiller(repo, async () => client, () => {});
    await Promise.all([distiller.distill(node.id), distiller.distill(node.id), distiller.drain()]);
    expect(prompts).toHaveLength(1);
  });

  it('leaves cards pending while no model is configured, then drains them', async () => {
    const node = await card();
    const idea = await repo.capture('idea', capture('An idea.'));
    let client: LlmClient | null = null;
    const distiller = new Distiller(repo, async () => client, () => {});
    await distiller.distill(node.id);
    expect((await repo.pendingDistills()).map((n) => n.id)).toEqual([node.id]);
    client = clientReplying({ titles: ['a', 'b', 'c'], summary: 's' }).client;
    await distiller.drain();
    expect(await repo.pendingDistills()).toEqual([]);
    expect((await repo.getNode(idea.id))!.summary).toBeUndefined(); // ideas are not compressed
  });
});
