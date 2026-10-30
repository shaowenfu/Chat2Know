// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '@/src/capture/markdown';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import type { NodeView } from '@/src/db/types';
import { suggestMastery } from '@/src/graph/mastery';
import { LlmClient, type ModelSettings } from '@/src/llm/client';
import { parseSuggestion, parseTags, suggestPrompt, tagPrompt } from '@/src/llm/prompts';
import { organize } from '@/src/services/organize';
import { suggestPlacement } from '@/src/services/placement';
import { MOCK_KEY, startMockLlm, type MockLlm } from '../mock-llm/server';

/**
 * Quality evals against a real model. Run with `npm run eval` after setting
 * CHAT2KNOW_BASE_URL, CHAT2KNOW_MODEL, CHAT2KNOW_API_KEY and CHAT2KNOW_EMBEDDING_MODEL
 * (in the environment or .env.local). CHAT2KNOW_BASE_URL=mock dry-runs the
 * harness against the test server. Metrics are printed and written to
 * tests/eval/results/latest.json; low scores never fail the run.
 */

const data = (name: string) => JSON.parse(readFileSync(join(__dirname, 'data', name), 'utf8')) as unknown;
const results: Record<string, unknown> = {};
let mock: MockLlm | undefined;
let settings: ModelSettings;
let client: LlmClient;

beforeAll(async () => {
  const env = process.env;
  if (env.CHAT2KNOW_BASE_URL === 'mock') mock = await startMockLlm();
  settings = {
    baseUrl: mock?.url ?? env.CHAT2KNOW_BASE_URL ?? '',
    model: env.CHAT2KNOW_MODEL ?? (mock ? 'mock-model' : ''),
    apiKey: mock ? MOCK_KEY : (env.CHAT2KNOW_API_KEY ?? ''),
    embeddingModel: env.CHAT2KNOW_EMBEDDING_MODEL ?? (mock ? 'mock-embed' : ''),
  };
  client = new LlmClient(settings); // throws "Model is not configured" when env is missing
});

afterAll(async () => {
  results.model = settings.model;
  results.embeddingModel = settings.embeddingModel;
  results.ranAt = new Date().toISOString();
  writeFileSync(join(__dirname, 'results', 'latest.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  await mock?.close();
});

function newRepo() {
  return new Repository(new Chat2KnowDB(`eval-${Math.random()}`), new Hlc('eval'));
}

describe('eval', () => {
  it('recording suggestion: kind accuracy', async () => {
    const cases = data('suggestion.json') as { question: string; quote: string; answer: string; kind: string }[];
    const misses: string[] = [];
    for (const c of cases) {
      const s = await client.json(suggestPrompt({ ...c, examples: [] }), parseSuggestion);
      if (s.kind !== c.kind) misses.push(`${c.question}: expected ${c.kind}, got ${s.kind}`);
    }
    results.suggestionKindAccuracy = (cases.length - misses.length) / cases.length;
    results.suggestionMisses = misses;
  });

  it('learning from choices: a deleted detail is not suggested again', async () => {
    const examples = [
      { kind: 'instance' as const, suggested: 'Who released Llama 3? — Llama 3 was released by Meta in April 2024.', action: 'delete' as const },
      { kind: 'instance' as const, suggested: 'Who made GPT-4o? — OpenAI released GPT-4o in May 2024.', action: 'delete' as const },
    ];
    const c = (data('suggestion.json') as { question: string; quote: string; answer: string }[])[3]!; // InternVL3.5
    const s = await client.json(suggestPrompt({ ...c, examples }), parseSuggestion);
    const text = `${s.titles.join(' ')} ${s.summary}`;
    results.preferenceRespected = !/上海|实验室|2025|Shanghai|laboratory/i.test(text);
    results.preferenceSample = text;
  });

  it('placement: top-3 hit rate of the expected parent', async () => {
    if (!settings.embeddingModel) return void (results.placementTop3 = 'skipped: no embedding model');
    const { cards, queries } = data('placement.json') as {
      cards: { id: string; title: string; summary: string }[];
      queries: { title: string; summary: string; expected: string }[];
    };
    let hits = 0;
    for (const q of queries) {
      const repo = newRepo();
      const ids = await repo.addCards(cards.map((c) => ({ title: c.title, summary: c.summary, quote: '' })));
      const byNode = new Map(ids.map((id, i) => [id, cards[i]!.id]));
      const [queryId] = await repo.addCards([{ title: q.title, summary: q.summary, quote: '' }]);
      const placement = await suggestPlacement(repo, client, settings.embeddingModel, queryId!);
      const top = [placement.duplicate, ...placement.parents].filter(Boolean).slice(0, 3).map((c) => byNode.get(c!.id));
      if (top.includes(q.expected)) hits++;
    }
    results.placementTop3 = hits / queries.length;
  });

  it('concept tagging: a tagged concept names the expected topic; chit-chat gets none', async () => {
    const cases = data('tags.json') as { question: string; expected: string[] }[];
    const tags = await client.json(tagPrompt({ asks: cases.map((c) => c.question), known: [] }), (v) => parseTags(v, cases.length));
    const hit = cases.filter((c, i) => {
      const names = tags[i]!.concepts.map((n) => n.toLowerCase());
      return c.expected.length ? names.some((n) => c.expected.some((e) => n.includes(e.toLowerCase()))) : names.length === 0;
    });
    results.tagAccuracy = hit.length / cases.length;
    results.tagSamples = cases.map((c, i) => ({ question: c.question, domain: tags[i]!.domain, concepts: tags[i]!.concepts }));
    expect(tags).toHaveLength(cases.length);
  });

  it('mastery suggestion: agreement with labelled cases (rule, no model)', () => {
    const cases = data('mastery.json') as { case: string; askCount: number; dependents: number; instance: boolean; expected: string }[];
    const agree = cases.filter((c) => {
      const node = {
        id: 'n',
        type: 'knowledge',
        title: c.case,
        status: 'confirmed',
        askCount: c.askCount,
        createdAt: 0,
        updatedAt: '',
        sources: [],
        ...(c.instance ? { parent: { id: 'p', kind: 'instance_of', order: 'a0' } } : {}),
      } as NodeView;
      return suggestMastery(node, c.dependents) === c.expected;
    }).length;
    results.masteryAgreement = agree / cases.length;
  });

  it('organize: every page fixture splits into cards with verbatim quotes', async () => {
    const dir = join(__dirname, '../fixtures/pages');
    const pages: Record<string, { cards: number; verbatimQuotes: number }> = {};
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      // Node environment (real fetch, no CORS); a throwaway DOM just for parsing the fixture.
      const doc = new new Window().DOMParser().parseFromString(readFileSync(join(dir, file), 'utf8'), 'text/html');
      const text = htmlToMarkdown(doc.body as unknown as HTMLElement);
      const cards = await organize(client, text);
      pages[file] = { cards: cards.length, verbatimQuotes: cards.filter((c) => text.includes(c.quote)).length };
    }
    results.organize = pages;
    expect(Object.keys(pages).length).toBeGreaterThan(0);
  });
});
