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
  it('tagging: each question lands on a topic of the seeded maps that names the expected keyword; chit-chat on none', async () => {
    const cases = data('tags.json') as { question: string; expected: string[] }[];
    const { map } = data('placement.json') as { map: Record<string, Record<string, string[]>> };
    const sections = Object.entries(map).flatMap(([subject, chapters]) =>
      Object.entries(chapters).flatMap(([chapter, topics]) => [`${subject} › ${chapter}`, ...topics.map((t) => `${subject} › ${chapter} › ${t}`)]),
    );
    const tags = await client.json(tagPrompt({ asks: cases.map((c) => c.question), sections }), (v) => parseTags(v, cases.length, sections.length));
    const hit = cases.filter((c, i) => {
      const titles = tags[i]!.map((k) => sections[k]!.toLowerCase());
      return c.expected.length ? titles.some((t) => c.expected.some((e) => t.includes(e.toLowerCase()))) : titles.length === 0;
    });
    results.tagAccuracy = hit.length / cases.length;
    results.tagSamples = cases.map((c, i) => ({ question: c.question, sections: tags[i]!.map((k) => sections[k]) }));
    expect(tags).toHaveLength(cases.length);
  });

  it('placement: the topic of each note in its map; an unnamed map gets its subject\'s name; statements become one short sentence', async () => {
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
    const labels = { unplaced: '待归位', unnamed: '未命名导图' };
    const maps = new Map((await repo.listSubjects()).map((m) => [m.title, m.id]));
    const lang = (process.env.CHAT2KNOW_LANG ?? 'zh') as 'zh' | 'en';
    const samples: { text: string; map: string; path: string[]; statement?: string }[] = [];
    let topics = 0;
    let named = 0;
    let unnamedCases = 0;
    const lengths: number[] = [];
    for (const [i, c] of cases.entries()) {
      // The user opened the map of the note's subject; a subject without a map gets a new, unnamed one.
      const mapId = maps.get(c.subject) ?? (await repo.addSubject('')).node.id;
      const source = { url: `https://chat.example/c/${i}`, pageTitle: '', quoteExact: c.text, quotePrefix: '', quoteSuffix: '', capturedAt: 0 };
      const r = await recordItem(repo, mapId, { itemType: c.itemType, title: c.itemType === 'statement' ? c.text : '', ...(c.itemType === 'formula' ? { latex: c.text } : {}), source }, labels);
      if (r.status !== 'recorded') throw new Error(`Duplicate case ${c.text}`);
      const path = (await placeItem(repo, client, settings.embeddingModel, { itemId: r.itemId, group: r.group, before: '', after: '', lang, unplaced: labels.unplaced })) ?? [];
      const item = await repo.node(r.itemId);
      if (!maps.has(c.subject)) {
        unnamedCases++;
        if (path[0]?.includes(c.subject)) named++;
      }
      if (c.topic.some((t) => path.slice(1).join(' ').toLowerCase().includes(t.toLowerCase()))) topics++;
      if (c.itemType === 'statement') lengths.push(item.title.length);
      samples.push({ text: c.text, map: path[0] ?? '', path: path.slice(1), ...(c.itemType === 'statement' ? { statement: item.title } : {}) });
      await repo.undo(r.group);
    }
    await db.delete();
    results.placementTopicAccuracy = topics / cases.length;
    results.unnamedMapNamed = unnamedCases ? named / unnamedCases : null;
    results.statementMaxLength = Math.max(...lengths);
    results.placementSamples = samples;
    expect(samples).toHaveLength(cases.length);
  });
});
