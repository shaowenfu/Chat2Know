// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmClient, type ModelSettings } from '@/src/llm/client';
import { parseTags, tagPrompt } from '@/src/llm/prompts';
import { MOCK_KEY, startMockLlm, type MockLlm } from '../mock-llm/server';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { recordItem } from '@/src/services/record';
import { placeItem } from '@/src/services/placement';

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

  it('placement: subject and topic of each note on a seeded map; statements become one short sentence', async () => {
    const { map, cases } = data('placement.json') as {
      map: Record<string, Record<string, string[]>>;
      cases: { itemType: 'formula' | 'statement'; text: string; subject: string; topic: string[] }[];
    };
    const db = new Chat2KnowDB(`eval-placement-${Date.now()}`);
    const repo = new Repository(db, new Hlc('eval'));
    for (const [subject, chapters] of Object.entries(map)) {
      const { node: s } = await repo.addSubject(subject);
      for (const [chapter, topics] of Object.entries(chapters)) {
        const { node: c } = await repo.addSection(s.id, chapter);
        for (const topic of topics) await repo.addSection(c.id, topic);
      }
    }
    const labels = { unplaced: '待归位', newSubject: '未命名学科' };
    const samples: { text: string; path: string[]; statement?: string }[] = [];
    let subjects = 0;
    let topics = 0;
    const lengths: number[] = [];
    for (const [i, c] of cases.entries()) {
      // Each note comes from its own conversation and is undone afterwards, so every case sees the same map.
      const source = { url: `https://chat.example/c/${i}`, pageTitle: '', quoteExact: c.text, quotePrefix: '', quoteSuffix: '', capturedAt: 0 };
      const r = await recordItem(repo, { itemType: c.itemType, title: c.itemType === 'statement' ? c.text : '', ...(c.itemType === 'formula' ? { latex: c.text } : {}), source }, labels);
      if (r.status !== 'recorded') throw new Error(`Duplicate case ${c.text}`);
      const path = await placeItem(repo, client, settings.embeddingModel, { itemId: r.itemId, group: r.group, before: '', after: '', untitled: labels.newSubject, unplaced: labels.unplaced });
      const item = await repo.node(r.itemId);
      if (path?.[0] === c.subject) subjects++;
      if (path?.[0] === c.subject && c.topic.some((t) => path.slice(1).join(' ').toLowerCase().includes(t.toLowerCase()))) topics++;
      if (c.itemType === 'statement') lengths.push(item.title.length);
      samples.push({ text: c.text, path: path ?? [], ...(c.itemType === 'statement' ? { statement: item.title } : {}) });
      await repo.undo(r.group);
    }
    await db.delete();
    results.placementSubjectAccuracy = subjects / cases.length;
    results.placementTopicAccuracy = topics / cases.length;
    results.statementMaxLength = Math.max(...lengths);
    results.placementSamples = samples;
    expect(samples).toHaveLength(cases.length);
  });
});
