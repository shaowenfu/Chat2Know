import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { DAY_MS, nextInterval, quizMode } from '@/src/review/schedule';
import { judge, problemFor, selfGrade } from '@/src/services/quiz';

let seq = 0;
let t: number;
let db: Chat2KnowDB;
let repo: Repository;

beforeEach(() => {
  t = 1_700_000_000_000;
  const now = () => (t += 1000);
  db = new Chat2KnowDB(`quiz-${seq++}`);
  repo = new Repository(db, new Hlc('d', now), now);
});
afterEach(() => db.delete());

async function mustKnowCard(title = 'Why scale by sqrt(d)?') {
  const node = await repo.capture('knowledge', {
    markdown: 'Scaling keeps softmax from saturating.',
    quote: { exact: 'Scaling keeps softmax from saturating.', prefix: '', suffix: '' },
    url: 'https://x.dev',
    pageTitle: 'x',
  });
  await repo.setDistillation(node.id, 'Scaling keeps the softmax out of saturation.', ['a', 'b', 'c']);
  await repo.confirmTitle(node.id, title);
  await repo.setMastery(node.id, 'internalize');
  return node.id;
}

describe('nextInterval', () => {
  it('grows on pass, slowly on partial, resets on fail', () => {
    expect(nextInterval(undefined, 'pass')).toBe(1);
    expect(nextInterval(1, 'pass')).toBe(2.5);
    expect(nextInterval(2.5, 'pass')).toBe(6.3);
    expect(nextInterval(4, 'partial')).toBe(4.8);
    expect(nextInterval(0.5, 'partial')).toBe(1);
    expect(nextInterval(10, 'fail')).toBe(1);
  });
});

describe('quiz', () => {
  it('only cards the user must know by heart are quizzed, until reviewed', async () => {
    const id = await mustKnowCard();
    const other = await mustKnowCard('other');
    await repo.setMastery(other, 'understand');
    expect((await repo.dueForQuiz(false)).map((n) => n.id)).toEqual([id]);
    await selfGrade(repo, id, 'it avoids saturation', 'pass');
    expect(await repo.dueForQuiz(false)).toEqual([]);
    t += 2 * DAY_MS;
    expect((await repo.dueForQuiz(false)).map((n) => n.id)).toEqual([id]);
  });

  it('an open question marked "know by heart" waits until it is kept', async () => {
    const { nodeId } = await repo.askLater({ term: 'VLM', question: '', capture: { markdown: 's', quote: { exact: 's', prefix: '', suffix: '' }, url: 'u', pageTitle: 'p' } });
    await repo.setMastery(nodeId, 'internalize');
    expect(await repo.dueForQuiz(false)).toEqual([]);
    expect((await repo.stats()).mustKnow).toBe(0);
  });

  it('draft cards are not quizzed until their title is confirmed', async () => {
    const node = await repo.capture('knowledge', { markdown: 'x', quote: { exact: 'x', prefix: '', suffix: '' }, url: 'u', pageTitle: 'p' });
    await repo.setMastery(node.id, 'internalize');
    expect(await repo.dueForQuiz(false)).toEqual([]);
  });

  it('pass masters the card, fail sets it back; the north star counts passes this week', async () => {
    const id = await mustKnowCard();
    const r1 = await selfGrade(repo, id, 'no idea', 'fail');
    expect(r1).toMatchObject({ verdict: 'fail', interval: 1, prompt: 'Why scale by sqrt(d)?' });
    expect((await repo.getNode(id))!.status).toBe('confirmed');
    const r2 = await selfGrade(repo, id, 'keeps softmax from saturating', 'pass');
    expect(r2.interval).toBe(2.5); // fail reset it to 1 day; a pass grows it
    expect((await repo.getNode(id))!.status).toBe('mastered');
    expect(await repo.stats()).toEqual({ masteredThisWeek: 1, earlierWeeks: [0, 0, 0], due: 0, mustKnow: 1, openQuestions: 0 });
    t += 8 * DAY_MS;
    expect(await repo.stats()).toMatchObject({ masteredThisWeek: 0, earlierWeeks: [1, 0, 0] });
  });

  it('AI judge compares with the kept statement and records its verdict', async () => {
    const id = await mustKnowCard();
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      expect(init!.body as string).toContain('Scaling keeps the softmax out of saturation.');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"partial","feedback":"Mention saturation."}' } }] }));
    });
    const client = new LlmClient({ baseUrl: 'https://m.dev', model: 'm', apiKey: 'k', embeddingModel: '' }, fetchFn);
    const review = await judge(repo, client, id, 'it makes numbers smaller');
    expect(review).toMatchObject({ verdict: 'partial', feedback: 'Mention saturation.', answer: 'it makes numbers smaller' });
    expect((await repo.getNode(id))!.status).toBe('confirmed'); // partial does not change status
  });

  it('a card to know by heart alternates recall and apply once a model is set up', async () => {
    expect([0, 1, 2, 3].map((n) => quizMode(n, true))).toEqual(['recall', 'apply', 'recall', 'apply']);
    expect(quizMode(1, false)).toBe('recall');
    const id = await mustKnowCard();
    expect((await repo.dueForQuiz(true))[0]!.mode).toBe('recall');
    await selfGrade(repo, id, 'keeps softmax from saturating', 'pass');
    t += 2 * DAY_MS;
    expect((await repo.dueForQuiz(true))[0]!.mode).toBe('apply');
    expect((await repo.dueForQuiz(false))[0]!.mode).toBe('recall');
  });

  it('apply: the model writes a problem, then judges the solution against the statement', async () => {
    const id = await mustKnowCard();
    const replies = ['A model with d=512 saturates. What do you change?', '{"verdict":"pass","feedback":"Right: scale the scores."}'];
    const bodies: string[] = [];
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      bodies.push(init!.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }));
    });
    const client = new LlmClient({ baseUrl: 'https://m.dev', model: 'm', apiKey: 'k', embeddingModel: '' }, fetchFn);
    const problem = await problemFor(repo, client, id);
    expect(bodies[0]).toContain('[task:problem]');
    const review = await judge(repo, client, id, 'divide the scores by sqrt(d)', problem);
    expect(bodies[1]).toContain('[task:judgeApply]');
    expect(bodies[1]).toContain('Scaling keeps the softmax out of saturation.');
    expect(review).toMatchObject({ mode: 'apply', prompt: problem, verdict: 'pass' });
    expect((await repo.stats()).masteredThisWeek).toBe(1); // a pass in any mode counts for the north star
  });
});
