// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { analyze } from '@/src/services/analysis';
import { MAX_OPEN } from '@/src/services/diagnose';
import { startMockLlm, type MockLlm } from '../mock-llm/server';

const DAY = 24 * 60 * 60 * 1000;
let mock: MockLlm;
let seq = 0;
let db: Chat2KnowDB;
let repo: Repository;
let t: number;
const client = () => new LlmClient({ baseUrl: mock.url, model: 'm', apiKey: 'test-key', embeddingModel: 'mock-embed' });

beforeAll(async () => {
  mock = await startMockLlm();
});
afterAll(() => mock.close());
beforeEach(() => {
  t = 1_700_000_000_000;
  db = new Chat2KnowDB(`diagnose-${seq++}`);
  repo = new Repository(db, new Hlc('d', () => t), () => (t += 1000));
});
afterEach(() => db.delete());

const ask = (text: string, conversation: string) => repo.recordAsk({ site: 'chatgpt', conversationUrl: `https://chatgpt.com/c/${conversation}`, text });
const rootNames = async () => {
  const names = new Map((await repo.listConcepts()).map((c) => [c.id, c.name]));
  return (await repo.listDiagnoses()).map((d) => names.get(d.rootConceptId));
};

/** Rephrasings of one confusion in one conversation (the mock embeds bags of words, so they are close). */
const CIRCLING = [
  'why is the matrix derivative dimension wrong here, part one?',
  'why is the matrix derivative dimension wrong here, part two?',
  'why is the matrix derivative dimension wrong here, part three?',
];

/** Transpose, multiplication and trace questions across five conversations: the shared operation rules are the gap. */
async function operationRuleTrouble() {
  for (const [text, c] of [
    ['why does the transpose reverse a product?', '1'],
    ['transpose of a sum?', '2'],
    ['is the transpose of an inverse the inverse of the transpose?', '3'],
    ['why is matrix multiplication not commutative?', '1'],
    ['order of multiplication in ABC?', '4'],
    ['when can I swap a multiplication?', '5'],
  ]) await ask(text!, c!);
}

describe('diagnose', () => {
  it('finds the shared foundation behind repeated questions, once', async () => {
    await operationRuleTrouble();
    expect(await analyze(repo, client(), 'mock-embed', t)).toBe(1);
    expect(await rootNames()).toEqual(['Matrix operation rules']);
    const [d] = await repo.listDiagnoses();
    expect(d).toMatchObject({ status: 'suspected', signals: [{ kind: 'repeat', count: 6 }] });
    expect(d!.evidenceAskIds).toHaveLength(6);
    // Running again finds nothing new.
    expect(await analyze(repo, client(), 'mock-embed', t)).toBe(0);
  });

  it('names the concept behind a circling run with the model', async () => {
    for (const text of CIRCLING) await ask(text, '9');
    await analyze(repo, client(), 'mock-embed', t);
    expect(mock.requests.some((r) => r.body.messages?.[0]?.content.startsWith('[task:circling]'))).toBe(true);
    expect(await rootNames()).toEqual(['Layout conventions']);
    expect((await repo.listDiagnoses())[0]!.signals).toEqual([{ kind: 'circling', count: 3 }]);
  });

  it('without an embedding model there is no circling', async () => {
    for (const text of CIRCLING) await ask(text, '9');
    await analyze(repo, client(), '', t);
    expect(await repo.listDiagnoses()).toEqual([]);
  });

  it('a dismissed root (or a broader one) waits 30 days, and its evidence never counts again', async () => {
    await operationRuleTrouble();
    await analyze(repo, client(), 'mock-embed', t);
    const [d] = await repo.listDiagnoses();
    await db.diagnoses.update(d!.id, { status: 'dismissed', decidedAt: t });
    await operationRuleTrouble(); // the same trouble again the next day
    expect(await analyze(repo, client(), 'mock-embed', t + DAY)).toBe(0);
    expect(await rootNames()).toEqual(['Matrix operation rules']); // not "Matrix basics" instead

    t += 31 * DAY;
    await operationRuleTrouble();
    expect(await analyze(repo, client(), 'mock-embed', t)).toBe(1);
    const fresh = (await repo.listDiagnoses()).find((x) => x.status === 'suspected')!;
    expect(fresh.evidenceAskIds).toHaveLength(6);
    expect(fresh.evidenceAskIds.some((id) => d!.evidenceAskIds.includes(id))).toBe(false);
  });

  it(`never keeps more than ${MAX_OPEN} suspected diagnoses open`, async () => {
    await repo.addDiagnoses(Array.from({ length: MAX_OPEN }, (_, i) => ({ rootConceptId: `x${i}`, signals: [], evidenceAskIds: [] })));
    await operationRuleTrouble();
    expect(await analyze(repo, client(), 'mock-embed', t)).toBe(0);
  });
});
