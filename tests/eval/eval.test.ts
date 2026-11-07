// @vitest-environment node
import 'fake-indexeddb/auto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmClient, type ModelSettings } from '@/src/llm/client';
import { askPrompt, parseStuck, stuckPrompt, type AskInput } from '@/src/llm/prompts';
import { MOCK_KEY, startMockLlm, type MockLlm } from '../mock-llm/server';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { recordItem } from '@/src/services/record';
import { placeItem } from '@/src/services/placement';
import { proposeOutline } from '@/src/services/outline';
import { generateReport } from '@/src/services/report';

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
  it('stuck: each labelled sequence of questions is judged stuck or not, with the right kind and topic', async () => {
    const { cases } = data('stuck.json') as {
      cases: {
        name: string;
        map: string;
        sections: string[];
        asks: { text: string; conversation: string; window?: boolean }[];
        expected: { stuck: boolean; kind?: string; topic?: string };
      }[];
    };
    const lang = (s: string) => (/[\u4e00-\u9fff]/.test(s) ? 'zh' : 'en');
    const samples = [];
    for (const c of cases) {
      const reply = await client.json(
        stuckPrompt({ lang: lang(c.map), map: c.map, asks: c.asks.map((a) => ({ ...a, window: a.window ?? false })), sections: c.sections }),
        (v) => parseStuck(v, c.asks.length, c.sections.length),
      );
      const topic = reply.stuck && reply.section >= 0 ? c.sections[reply.section]! : '';
      samples.push({
        name: c.name,
        stuckRight: reply.stuck === c.expected.stuck,
        kindRight: c.expected.stuck ? reply.stuck && reply.kind === c.expected.kind : undefined,
        topicRight: c.expected.stuck ? (c.expected.topic ? topic.toLowerCase().includes(c.expected.topic.toLowerCase()) : topic === '') : undefined,
        reply,
      });
    }
    const stuckOnes = samples.filter((s) => s.kindRight !== undefined);
    results.stuckAccuracy = samples.filter((s) => s.stuckRight).length / samples.length;
    results.stuckKindAccuracy = stuckOnes.filter((s) => s.kindRight).length / stuckOnes.length;
    results.stuckTopicAccuracy = stuckOnes.filter((s) => s.topicRight).length / stuckOnes.length;
    // The card stays short: the longest explanation, in characters (Chinese) or words (English).
    const size = (t: string) => (/[\u4e00-\u9fff]/.test(t) ? t.length : t.split(/\s+/).length);
    results.stuckExplanationMaxSize = Math.max(0, ...samples.map((s) => (s.reply.stuck ? size(s.reply.explanation) : 0)));
    results.stuckSamples = samples;
    expect(samples).toHaveLength(cases.length);
  });

  it('ask: short answers about the selection, in the learner\'s language, formulas as $…$, follow-ups that build on the answer', async () => {
    type Case = Omit<AskInput, 'turns' | 'question'> & { question: string; mustMention: string[][] };
    const { cases, followUp } = data('ask.json') as { cases: Case[]; followUp: Omit<Case, 'question'> & { first: string; next: string } };
    const answer = async (input: AskInput) => {
      let text = '';
      for await (const d of client.stream(askPrompt(input))) text += d;
      return text;
    };
    const sentences = (t: string) => t.split(/[。！？!?]|\.\s/).filter((x) => x.trim().length > 3).length;
    const samples = [];
    for (const c of cases) {
      const text = await answer({ ...c, turns: [] });
      samples.push({
        question: c.question,
        text,
        sentences: sentences(text),
        languageRight: c.lang === 'zh' ? /[\u4e00-\u9fff]/.test(text) : !/[\u4e00-\u9fff]/.test(text),
        noHeadings: !/^#+\s|^\*\*[^*]+\*\*\s*$/m.test(text),
        mentions: c.mustMention.every((any) => any.some((w) => text.toLowerCase().includes(w.toLowerCase()))),
      });
    }
    const first = await answer({ ...followUp, turns: [], question: followUp.first });
    const next = await answer({ ...followUp, turns: [{ question: followUp.first, answer: first }], question: followUp.next });
    results.askLanguageRight = samples.filter((s) => s.languageRight).length / samples.length;
    results.askNoHeadings = samples.filter((s) => s.noHeadings).length / samples.length;
    results.askMentions = samples.filter((s) => s.mentions).length / samples.length;
    results.askMaxSentences = Math.max(...samples.map((s) => s.sentences));
    results.askFollowUpBuilds = followUp.mustMention.every((any) => any.some((w) => next.includes(w)));
    results.askSamples = [...samples, { question: followUp.next, text: next }];
    expect(samples).toHaveLength(cases.length);
  });

  it('report: prose about this map\'s questions, in the learner\'s language, quoting them, with no scores or percentages', async () => {
    const { cases } = data('stuck.json') as { cases: { map: string; sections: string[]; asks: { text: string; conversation: string; window?: boolean }[] }[] };
    const samples = [];
    // One Chinese and one English map, each with the questions of every case on its subject.
    for (const map of ['线性代数', 'Transformers']) {
      const own = cases.filter((c) => c.map === map);
      const db = new Chat2KnowDB(`eval-report-${map}-${Date.now()}`);
      let t = Date.UTC(2026, 10, 1, 8);
      const repo = new Repository(db, new Hlc('eval', () => (t += 5 * 60_000)), () => t);
      const { node: m } = await repo.addSubject(map);
      for (const title of own[0]!.sections.filter((x) => !x.includes(' › '))) await repo.addSection(m.id, title);
      for (const c of own) for (const a of c.asks) await repo.recordAsk({ site: 'deepseek', conversationUrl: `https://chat.deepseek.com/${map}/${a.conversation}`, text: a.text, via: a.window ? 'window' : 'site', mapId: m.id });
      const zh = /[\u4e00-\u9fff]/.test(map);
      const report = await generateReport(repo, client, m.id, zh ? 'zh' : 'en', { window: zh ? '浮窗' : 'Ask window', notes: (n) => (zh ? `${n} 条笔记` : `${n} notes`) }, t);
      const text = report.markdown;
      const asked = own.flatMap((c) => c.asks.map((a) => a.text));
      samples.push({
        map,
        text,
        size: zh ? text.replace(/\s/g, '').length : text.split(/\s+/).length,
        languageRight: zh ? /[\u4e00-\u9fff]/.test(text) : !/[\u4e00-\u9fff]/.test(text),
        // "attention scores" are subject matter; a score of the learner is not.
        noScores: !/\d+\s*(%|percent)|\d+\s*\/\s*10\b|\bout of 10\b|分数|得分|评分|掌握(程度|度)|\byour (score|mastery|level|grade)\b|\brating\b/i.test(text),
        noJudging: !/你笨|没吃透|基础差|you are slow|weak basics/i.test(text),
        headingFirst: /^#/.test(text),
        quotesQuestions: asked.some((q) => text.includes(q.slice(0, 8))),
      });
      await db.delete();
    }
    results.reportLanguageRight = samples.every((s) => s.languageRight);
    results.reportNoScores = samples.every((s) => s.noScores);
    results.reportNoJudging = samples.every((s) => s.noJudging);
    results.reportStartsWithHeading = samples.filter((s) => s.headingFirst).length;
    results.reportQuotesQuestions = samples.every((s) => s.quotesQuestions);
    results.reportSizes = samples.map((s) => s.size);
    results.reportSamples = samples;
    expect(samples).toHaveLength(2);
  });

  it('requests: a note recorded with a request is written as asked; without one it is still one sentence', async () => {
    const { cases } = data('requests.json') as {
      cases: { map: string; request: string; text: string; expect: { table?: boolean; list?: boolean; contains?: string[]; notContains?: string[]; maxLength?: number } }[];
    };
    const db = new Chat2KnowDB(`eval-requests-${Date.now()}`);
    const repo = new Repository(db, new Hlc('eval'));
    const labels = { unplaced: '待归位', unnamed: '未命名导图' };
    const samples = [];
    for (const [i, c] of cases.entries()) {
      const mapId = (await repo.listSubjects()).find((m) => m.title === c.map)?.id ?? (await repo.addSubject(c.map)).node.id;
      const source = { url: `https://chat.example/r/${i}`, pageTitle: '', quoteExact: '', quotePrefix: '', quoteSuffix: '', capturedAt: 0 };
      const r = await recordItem(repo, mapId, { itemType: 'statement', title: c.text, source, ...(c.request ? { request: c.request } : {}) }, labels);
      if (r.status !== 'recorded') throw new Error(`Duplicate case ${i}`);
      await placeItem(repo, client, settings.embeddingModel, { itemId: r.itemId, group: r.group, before: '', after: '', lang: 'zh', unplaced: labels.unplaced });
      const note = (await repo.node(r.itemId)).title;
      const e = c.expect;
      const honoured =
        (!e.table || /^\s*\|.*\|\s*$/m.test(note) && /\|\s*-{3,}/.test(note)) &&
        (!e.list || /^\s*(?:[-*]|\d+[.)])\s+/m.test(note)) &&
        (e.contains ?? []).every((x) => note.includes(x)) &&
        (e.notContains ?? []).every((x) => !note.includes(x)) &&
        (e.maxLength === undefined || note.length <= e.maxLength);
      samples.push({ request: c.request, honoured, note });
    }
    results.requestsHonoured = samples.filter((s) => s.honoured).length / samples.length;
    results.requestSamples = samples;
    await db.delete();
    expect(samples).toHaveLength(cases.length);
  });

  it('placement: the topic of each note in its map; an unnamed map gets its subject\'s name; statements become one short sentence', async () => {
    const { map, cases } = data('placement.json') as {
      map: Record<string, Record<string, string[]>>;
      cases: { itemType: 'formula' | 'statement'; text: string; subject: string; topic: string[]; term?: boolean }[];
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
    const termsExplained: boolean[] = [];
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
      if (c.itemType === 'statement' && !c.term) lengths.push(item.title.length);
      if (c.term) termsExplained.push(/[：:]/.test(item.title) && item.title.length > c.text.length + 4);
      samples.push({ text: c.text, map: path[0] ?? '', path: path.slice(1), ...(c.itemType === 'statement' ? { statement: item.title } : {}) });
      await repo.undo(r.group);
    }
    await db.delete();
    results.placementTopicAccuracy = topics / cases.length;
    results.unnamedMapNamed = unnamedCases ? named / unnamedCases : null;
    results.statementMaxLength = Math.max(...lengths);
    results.termsExplained = termsExplained.filter(Boolean).length / termsExplained.length;
    results.placementSamples = samples;
    expect(samples).toHaveLength(cases.length);
  });

  it('outlines: real chapters of the subject, in its language, never a generic template', async () => {
    const cases = data('outlines.json') as { subject: string; expected: string[] }[];
    const db = new Chat2KnowDB(`eval-outline-${Date.now()}`);
    const repo = new Repository(db, new Hlc('eval'));
    const lang = (process.env.CHAT2KNOW_LANG ?? 'zh') as 'zh' | 'en';
    const samples: { subject: string; chapters?: string[]; error?: string }[] = [];
    let valid = 0;
    let covered = 0;
    for (const c of cases) {
      const { node } = await repo.addSubject(c.subject);
      try {
        const outline = await proposeOutline(repo, client, node.id, lang);
        valid++;
        const titles = JSON.stringify(outline).toLowerCase();
        covered += c.expected.filter((e) => titles.includes(e.toLowerCase())).length / c.expected.length;
        samples.push({ subject: c.subject, chapters: outline.map((o) => o.title) });
      } catch (err) {
        samples.push({ subject: c.subject, error: String(err) });
      }
    }
    await db.delete();
    results.outlineValid = valid / cases.length;
    results.outlineCoverage = covered / cases.length;
    results.outlineSamples = samples;
    expect(samples).toHaveLength(cases.length);
  });
});
