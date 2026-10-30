// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { analyze } from '@/src/services/analysis';
import { checkDiagnosisQuiz, decide, diagnosisQuiz, keepReview, listDiagnosisViews, systematicReview } from '@/src/services/confirm';
import { selfGrade } from '@/src/services/quiz';
import { startMockLlm, type MockLlm } from '../mock-llm/server';

let mock: MockLlm;
let seq = 0;
let db: Chat2KnowDB;
let repo: Repository;
let t: number;
const client = () => new LlmClient({ baseUrl: mock.url, model: 'm', apiKey: 'test-key', embeddingModel: '' });

beforeAll(async () => {
  mock = await startMockLlm();
});
afterAll(() => mock.close());
beforeEach(async () => {
  t = 1_700_000_000_000;
  db = new Chat2KnowDB(`confirm-${seq++}`);
  repo = new Repository(db, new Hlc('d', () => t), () => (t += 1000));
  for (const [text, c] of [
    ['why does the transpose reverse a product?', '1'],
    ['transpose of a sum?', '2'],
    ['transpose of an inverse?', '3'],
    ['why is matrix multiplication not commutative?', '1'],
    ['order of multiplication in ABC?', '4'],
    ['when can I swap a multiplication?', '5'],
  ]) await repo.recordAsk({ site: 'chatgpt', conversationUrl: `https://chatgpt.com/c/${c}`, text: text! });
  await analyze(repo, client(), '', t);
});
afterEach(() => db.delete());

const only = async () => (await listDiagnosisViews(repo))[0]!;

describe('confirming a diagnosis', () => {
  it('shows the hypothesis with the questions as evidence', async () => {
    const d = await only();
    expect(d).toMatchObject({ status: 'suspected', concept: { name: 'Matrix operation rules', domain: 'Linear algebra' }, remediated: false });
    expect(d.about.sort()).toEqual(['Matrix multiplication order', 'Transpose properties']);
    expect(d.evidence.map((e) => e.conversationUrl)).toContain('https://chatgpt.com/c/5');
  });

  it('failing the quiz confirms it; review cards go under the concept, to know by heart; passing them remediates', async () => {
    const d = await only();
    const items = await diagnosisQuiz(repo, client(), d.id);
    expect(items).toHaveLength(3);
    const res = await checkDiagnosisQuiz(repo, client(), d.id, items, ['no idea', 'order reverses', 'pass']);
    expect(res).toMatchObject({ passed: false });
    expect(res.results.map((r) => r.verdict)).toEqual(['fail', 'pass', 'fail']);
    expect(await db.quizzes.count()).toBe(1);

    const confirmed = await only();
    expect(confirmed.status).toBe('confirmed');
    const conceptNode = (await repo.listNodes()).find((n) => n.id === confirmed.concept.nodeId)!;
    expect(conceptNode).toMatchObject({ type: 'topic', title: 'Matrix operation rules' });

    const cards = await systematicReview(repo, client(), d.id);
    expect(cards.map((c) => c.question)).toEqual(['What is Matrix basics?', 'What is Matrix operation rules?']); // foundations first
    expect(await keepReview(repo, d.id, cards, true)).toBe(2);
    const kept = (await repo.listNodes()).filter((n) => n.parent?.id === conceptNode.id).sort((a, b) => (a.parent!.order < b.parent!.order ? -1 : 1));
    expect(kept.map((n) => [n.title, n.mastery])).toEqual([
      ['What is Matrix basics?', 'internalize'],
      ['What is Matrix operation rules?', 'internalize'],
    ]);
    expect((await repo.dueForQuiz(false)).length).toBe(2); // they enter Quiz me

    await selfGrade(repo, kept[0]!.id, 'x', 'pass');
    expect((await only()).remediated).toBe(false);
    await selfGrade(repo, kept[1]!.id, 'x', 'pass');
    expect((await only()).remediated).toBe(true);
  });

  it('passing the quiz withdraws it', async () => {
    const d = await only();
    const items = await diagnosisQuiz(repo, client(), d.id);
    expect((await checkDiagnosisQuiz(repo, client(), d.id, items, ['order reverses', 'order reverses', 'order reverses'])).passed).toBe(true);
    expect(await listDiagnosisViews(repo)).toEqual([]);
    expect((await repo.listDiagnoses())[0]).toMatchObject({ status: 'dismissed' });
  });

  it('the learner can skip the quiz: accurate confirms, not accurate dismisses', async () => {
    const d = await only();
    await decide(repo, d.id, false);
    expect((await repo.listDiagnoses())[0]).toMatchObject({ status: 'dismissed', feedback: 'inaccurate' });
    await db.diagnoses.update(d.id, { status: 'suspected' });
    await decide(repo, d.id, true);
    expect((await repo.listDiagnoses())[0]).toMatchObject({ status: 'confirmed', feedback: 'accurate' });
  });

  it('deleting a question removes it from the evidence', async () => {
    const d = await only();
    await repo.deleteAsk(d.evidence[0]!.id);
    expect((await only()).evidence).toHaveLength(d.evidence.length - 1);
  });
});
