import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { parseExplanationCheck } from '@/src/llm/prompts';
import { checkExplanation, oneMinuteScript } from '@/src/services/explain';

let seq = 0;
let db: Chat2KnowDB;
let repo: Repository;

beforeEach(() => {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  db = new Chat2KnowDB(`explain-${seq++}`);
  repo = new Repository(db, new Hlc('d', now), now);
});
afterEach(() => db.delete());

async function kept(title: string, summary: string) {
  const node = await repo.capture('knowledge', { markdown: summary, quote: { exact: summary, prefix: '', suffix: '' }, url: 'u', pageTitle: 'p' });
  await repo.setDistillation(node.id, summary, ['a', 'b', 'c']);
  await repo.confirmTitle(node.id, title);
  return node.id;
}

function client(reply: object) {
  const bodies: string[] = [];
  const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    bodies.push(init!.body as string);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
  });
  return { bodies, client: new LlmClient({ baseUrl: 'https://m.dev', model: 'm', apiKey: 'k', embeddingModel: '' }, fetchFn) };
}

describe('explain it to me', () => {
  it('checks every kept card in the branch and marks the missed ones', async () => {
    const root = await kept('What does attention do?', 'Attention mixes values weighted by query-key similarity.');
    const child = await kept('Why scale the scores?', 'Scaling keeps the softmax out of saturation.');
    await repo.moveNode(child, root);
    const { bodies, client: c } = client({
      feedback: 'Clear on the mixing, silent on scaling.',
      points: [
        { point: 2, verdict: 'fail', feedback: 'Scaling not mentioned.' },
        { point: 1, verdict: 'pass', feedback: 'Good.' },
      ],
    });
    const result = await checkExplanation(repo, c, root, 'Attention takes a weighted mix of values.');
    expect(bodies[0]).toContain('[1] What does attention do? — Attention mixes values');
    expect(bodies[0]).toContain('[2] Why scale the scores? — Scaling keeps');
    expect(result.points.map((p) => [p.title, p.verdict])).toEqual([
      ['What does attention do?', 'pass'],
      ['Why scale the scores?', 'fail'],
    ]);
    const nodes = new Map((await repo.listNodes()).map((n) => [n.id, n]));
    expect(nodes.get(root)!.lastVerdict).toBe('pass');
    expect(nodes.get(child)!.lastVerdict).toBe('fail');
    expect((await db.reviews.toArray()).every((r) => r.mode === 'explain' && r.prompt === 'What does attention do?')).toBe(true);
  });

  it('rejects model output that skips or repeats a point', () => {
    const point = (n: number) => ({ point: n, verdict: 'pass', feedback: 'ok' });
    expect(() => parseExplanationCheck({ feedback: 'f', points: [point(1)] }, 2)).toThrow('Expected 2 points, got 1');
    expect(() => parseExplanationCheck({ feedback: 'f', points: [point(1), point(1)] }, 2)).toThrow('Unexpected point 1');
    expect(() => parseExplanationCheck({ feedback: 'f', points: [point(1), point(3)] }, 2)).toThrow('Unexpected point 3');
  });

  it('asks for an explanation before calling the model', async () => {
    const root = await kept('Q', 'S');
    const { bodies, client: c } = client({});
    await expect(checkExplanation(repo, c, root, '   ')).rejects.toMatchObject({ key: 'explain.empty' });
    expect(bodies).toEqual([]);
  });

  it('writes a one-minute script from the branch statements only', async () => {
    const root = await kept('What does attention do?', 'Attention mixes values.');
    const child = await kept('Why scale?', 'Scaling avoids saturation.');
    await repo.moveNode(child, root);
    const bodies: string[] = [];
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      bodies.push(init!.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Attention mixes values, scaled to avoid saturation.' } }] }));
    });
    const c = new LlmClient({ baseUrl: 'https://m.dev', model: 'm', apiKey: 'k', embeddingModel: '' }, fetchFn);
    expect(await oneMinuteScript(repo, c, root)).toBe('Attention mixes values, scaled to avoid saturation.');
    expect(bodies[0]).toContain('[task:oneMinute]');
    expect(bodies[0]).toContain('- Why scale? — Scaling avoids saturation.');
    expect(await db.reviews.count()).toBe(0); // a script is not a check
  });
});
