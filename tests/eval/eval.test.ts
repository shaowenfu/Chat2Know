// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmClient, type ModelSettings } from '@/src/llm/client';
import { parseTags, tagPrompt } from '@/src/llm/prompts';
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

describe('eval', () => {
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
});
