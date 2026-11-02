import type { ChatMessage } from './client';
import { LlmError } from './client';
import { obj, str, strList } from './validate';
import type { OutlineNode } from '@/src/graph/tree';

/**
 * Every prompt starts its system message with a `[task:<name>]` tag. Real models
 * ignore it; the mock server in tests routes on it.
 */
const system = (task: string, text: string): ChatMessage => ({ role: 'system', content: `[task:${task}]\n${text}` });

// ---------------------------------------------------------------- gaps: tagging questions onto the map

/** Numbered lists are 1-based in prompts; replies refer to the numbers. */
const numbered = (lines: string[]) => lines.map((l, i) => `[${i + 1}] ${l}`).join('\n');

const index = (v: unknown, max: number, what: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) throw new LlmError(`Unexpected ${what} ${String(v)}`);
  return v - 1;
};

/** Which sections of the learner's maps each question is about (0–3 each). */
export function tagPrompt(input: { asks: string[]; sections: string[] }): ChatMessage[] {
  return [
    system(
      'tag',
      'A learner asked an AI the numbered questions below. Their knowledge maps have the numbered topics listed after them ("subject › chapter › topic"). For each question, give the numbers of the 0–3 most specific topics it is about. A question about none of them (chit-chat, writing or formatting requests, another subject) gets none. Return JSON only: {"tags": [{"ask": 1, "sections": [3]}]} with every question exactly once.',
    ),
    { role: 'user', content: `Questions:\n${numbered(input.asks)}\n\nTopics:\n${numbered(input.sections)}` },
  ];
}

/** Section indexes per question, in question order. */
export function parseTags(value: unknown, askCount: number, sectionCount: number): number[][] {
  const list = obj(value).tags;
  if (!Array.isArray(list)) throw new LlmError('Expected "tags" to be a list');
  const byAsk = new Map<number, number[]>();
  for (const item of list) {
    const t = obj(item);
    const n = index(t.ask, askCount, 'ask');
    if (byAsk.has(n)) throw new LlmError(`Ask ${n + 1} tagged twice`);
    if (!Array.isArray(t.sections) || t.sections.length > 3) throw new LlmError('Expected 0–3 "sections"');
    byAsk.set(n, [...new Set(t.sections.map((x) => index(x, sectionCount, 'section')))]);
  }
  if (byAsk.size !== askCount) throw new LlmError(`Expected ${askCount} tagged questions, got ${byAsk.size}`);
  return Array.from({ length: askCount }, (_, i) => byAsk.get(i)!);
}

/** Which topics of one subject must be understood before which. */
export function prereqPrompt(input: { subject: string; sections: string[] }): ChatMessage[] {
  return [
    system(
      'prereq',
      'You map prerequisites between the numbered topics of one subject, to tell basics from what builds on them. An edge {"from": A, "to": B} means topic A must be understood before topic B. Give only direct, real prerequisites between the listed topics; a chapter is not a prerequisite of its own topics. No cycles. Return JSON only: {"edges": [{"from": 1, "to": 2}]}.',
    ),
    { role: 'user', content: `Subject: ${input.subject}\n\nTopics:\n${numbered(input.sections)}` },
  ];
}

export function parsePrereqs(value: unknown, sectionCount: number): { from: number; to: number }[] {
  const list = obj(value).edges;
  if (!Array.isArray(list)) throw new LlmError('Expected "edges" to be a list');
  return list.map((item) => {
    const e = obj(item);
    const edge = { from: index(e.from, sectionCount, 'topic'), to: index(e.to, sectionCount, 'topic') };
    if (edge.from === edge.to) throw new LlmError('A topic cannot be its own prerequisite');
    return edge;
  });
}

// ---------------------------------------------------------------- gaps: filling one in, or a question to try

export const FILL_MAX = 8;

export interface FillItem {
  itemType: 'formula' | 'statement';
  text: string; // LaTeX for a formula, one sentence for a statement
}

/** The core formulas and statements of a topic the learner keeps asking about, without what they already have. */
export function fillPrompt(input: { path: string; existing: string[]; asks: string[] }): ChatMessage[] {
  return [
    system(
      'fill',
      `A learner keeps asking about the topic below; their map of it is thin. Give the core formulas and statements of this topic that answer what they asked: at most ${FILL_MAX}, each one formula (LaTeX, no $ delimiters) or one plain sentence (about 40 Chinese characters or 20 English words, formulas inside as $...$), in the language of the topic. Leave out what the learner already has. Return JSON only: {"items": [{"type": "formula", "text": "..."}, {"type": "statement", "text": "..."}]}.`,
    ),
    { role: 'user', content: `Topic: ${input.path}\n\nAlready on the map:\n${input.existing.map((e) => `- ${e}`).join('\n') || '(nothing)'}\n\nThe learner asked:\n${input.asks.map((a) => `- ${a}`).join('\n')}` },
  ];
}

export function parseFill(value: unknown): FillItem[] {
  const list = obj(value).items;
  if (!Array.isArray(list) || list.length === 0 || list.length > FILL_MAX) throw new LlmError(`Expected 1–${FILL_MAX} "items"`);
  return list.map((item) => {
    const o = obj(item);
    const type = o.type;
    if (type !== 'formula' && type !== 'statement') throw new LlmError('Expected "type" formula or statement');
    return { itemType: type, text: str(o, 'text') };
  });
}

/** One short question that shows whether the learner has the topic. */
export function quizPrompt(input: { path: string; items: string[]; asks: string[] }): ChatMessage[] {
  return [
    system(
      'quiz',
      'Write one short question that shows whether a learner really has the topic below: something they can answer in a line or two, aimed at what they kept asking about, in the language of the topic. Return JSON only: {"question": "..."}.',
    ),
    { role: 'user', content: `Topic: ${input.path}\n\nOn their map:\n${input.items.map((e) => `- ${e}`).join('\n') || '(nothing)'}\n\nThey asked:\n${input.asks.map((a) => `- ${a}`).join('\n')}` },
  ];
}

export const parseQuiz = (value: unknown): string => str(obj(value), 'question');

export function judgePrompt(input: { path: string; question: string; answer: string }): ChatMessage[] {
  return [
    system(
      'judge',
      'Judge a learner\'s answer to a question about the topic below. "correct" is true when the answer gets the essential point right, even if brief or informal. "feedback" is one sentence: what was right, or the key point that was missing, in the language of the question. Return JSON only: {"correct": true, "feedback": "..."}.',
    ),
    { role: 'user', content: `Topic: ${input.path}\nQuestion: ${input.question}\nAnswer: ${input.answer}` },
  ];
}

export function parseJudgement(value: unknown): { correct: boolean; feedback: string } {
  const o = obj(value);
  if (typeof o.correct !== 'boolean') throw new LlmError('Expected boolean "correct"');
  return { correct: o.correct, feedback: str(o, 'feedback') };
}

// ---------------------------------------------------------------- automatic placement

/** The language a prompt is written in, and asks the model to answer in. */
export type PromptLang = 'zh' | 'en';

export interface PlacementInput {
  lang: PromptLang;
  itemType: 'formula' | 'statement';
  text: string; // LaTeX for a formula, the recorded text for a statement
  before: string; // the conversation just before it
  after: string;
  map: string; // the open map's name, '' when the user left it unnamed
  now: string; // where it sits now, "chapter › topic" below the map
  candidates: string[]; // the closest topics, "chapter › topic"
  outline: string; // the map's chapters and topics, indented titles
  examples: { text: string; path: string[] }[]; // where the user moved earlier notes
}

export interface PlacementReply {
  path: string[]; // 1–3 chapter / topic titles below the map
  statement: string; // the one-sentence statement; "" for a formula
  mapName: string; // a name for an unnamed map; "" otherwise
}

export const MAX_PATH = 3;

const PLACE_TEXT = {
  zh: {
    task: (statement: boolean, unnamed: boolean) =>
      [
        '你负责把学习者的一条笔记放进他打开的这张知识导图。导图下面是章和知识点，标题都是简短的名词，不是问句。',
        '为这条笔记选出它在这张导图里的路径：1 到 3 层章 / 知识点标题。优先用已有位置（候选位置或导图结构里的原标题，一字不差）；都不合适时才新建知识点或章。新标题是简短的中文名词。学习者自己改过的位置说明了他的整理习惯，照着做。',
        statement
          ? '再把笔记改写成一句保留原意的话（约 40 个汉字以内，公式写成 $...$）。如果笔记只是一个术语或名称，写成"术语：一句话解释"，解释根据上下文和你的知识。'
          : '这条笔记是公式，"statement" 填 ""。',
        unnamed ? '这张导图还没有名字：按这条笔记所属的学科或主题，起一个简短的中文名字填在 "mapName"。' : '"mapName" 填 ""。',
        '只返回 JSON：{"path": ["..."], "statement": "...", "mapName": "..."}。',
      ].join(''),
    labels: { note: '笔记', formula: '公式', statement: '文字', context: '上下文', now: '现在在', candidates: '候选位置', map: '导图', unnamed: '（未命名）', outline: '导图结构', examples: '学习者改过的位置', none: '（无）' },
  },
  en: {
    task: (statement: boolean, unnamed: boolean) =>
      [
        "You file one of a learner's notes into the knowledge map they have open. Below the map are chapters and topics; their titles are short nouns, never questions.",
        ' Choose the note\'s path in this map: 1–3 chapter / topic titles. Prefer an existing place (a candidate or a path from the map\'s outline, with the exact titles); add a new topic or chapter only when nothing fits. New titles are short English nouns. The learner\'s own corrections show how they organize notes; follow them.',
        statement
          ? ' Also rewrite the note as one plain sentence that keeps its claim (about 20 words at most, formulas as $...$). If the note is only a term or a name, write "term: a one-sentence explanation", drawn from the context and your knowledge.'
          : ' The note is a formula: "statement" is "".',
        unnamed ? ' The map has no name yet: give it a short English name for the subject or topic this note belongs to, in "mapName".' : ' "mapName" is "".',
        ' Return JSON only: {"path": ["..."], "statement": "...", "mapName": "..."}.',
      ].join(''),
    labels: { note: 'Note', formula: 'formula', statement: 'text', context: 'Context', now: 'Now in', candidates: 'Candidates', map: 'Map', unnamed: '(unnamed)', outline: "The map's outline", examples: "The learner's corrections", none: '(none)' },
  },
} as const;

export function placePrompt(input: PlacementInput): ChatMessage[] {
  const t = PLACE_TEXT[input.lang];
  const l = t.labels;
  const examples = input.examples.length ? input.examples.map((e) => `- ${e.text} → ${e.path.join(' › ')}`).join('\n') : l.none;
  return [
    system('place', t.task(input.itemType === 'statement', !input.map)),
    {
      role: 'user',
      content: [
        `${l.note} (${input.itemType === 'formula' ? l.formula : l.statement}): ${input.text}`,
        `${l.context}: …${input.before} [NOTE] ${input.after}…`,
        `${l.map}: ${input.map || l.unnamed}`,
        `${l.now}: ${input.now || l.none}`,
        `${l.candidates}:\n${input.candidates.map((c) => `- ${c}`).join('\n') || l.none}`,
        `${l.outline}:\n${input.outline || l.none}`,
        `${l.examples}:\n${examples}`,
      ].join('\n\n'),
    },
  ];
}

export function parsePlacement(value: unknown, itemType: 'formula' | 'statement', unnamed: boolean): PlacementReply {
  const o = obj(value);
  const path = strList(o, 'path');
  if (path.length < 1 || path.length > MAX_PATH) throw new LlmError(`Expected 1–${MAX_PATH} titles in "path"`);
  const statement = itemType === 'statement' ? str(o, 'statement') : '';
  const mapName = unnamed ? str(o, 'mapName') : '';
  return { path, statement, mapName };
}

// ---------------------------------------------------------------- outline

/** Chapters, topics and one more level at most: the subject plus three levels. */
export const OUTLINE_DEPTH = 3;
const OUTLINE_MAX_NODES = 200;

/** One real outline per language: the model sees what a subject's own outline looks like, not a template. */
const OUTLINE_EXAMPLE = {
  zh: '{"outline": [{"title": "极限与连续", "children": [{"title": "数列极限", "children": []}, {"title": "函数极限", "children": []}, {"title": "连续性", "children": []}]}, {"title": "导数与微分", "children": [{"title": "导数的定义", "children": []}, {"title": "求导法则", "children": []}, {"title": "高阶导数", "children": []}]}, {"title": "不定积分", "children": [{"title": "换元积分法", "children": []}, {"title": "分部积分法", "children": []}]}]}（只示意前三章）',
  en: '{"outline": [{"title": "Limits and continuity", "children": [{"title": "Limits of sequences", "children": []}, {"title": "Limits of functions", "children": []}, {"title": "Continuity", "children": []}]}, {"title": "Derivatives", "children": [{"title": "Definition of the derivative", "children": []}, {"title": "Differentiation rules", "children": []}, {"title": "Higher derivatives", "children": []}]}, {"title": "Integrals", "children": [{"title": "Substitution", "children": []}, {"title": "Integration by parts", "children": []}]}]} (first three chapters only)',
} as const;

const OUTLINE_TEXT = {
  zh: {
    task: (toc: boolean) =>
      [
        '你为学习者的一张知识导图铺出这门学科的大纲：章、章下的知识点，知识点下最多再分一层。标题是这门学科里真实的章节和知识点名称：简短的名词，不是问句，不编号，语言与导图名称一致。不要写"概述""简介""总结""应用""方法"这类放在任何学科都成立的空标题。大纲只有结构，不写公式、结论或解释。',
        toc ? '按学习者粘贴的教材目录来：它的章和节就是大纲，顺序不变，标题缩成名词。' : '按这门学科的标准课程或教材来覆盖：大约 6–12 章，每章 2–8 个知识点。',
        '学习者已有的知识点放得进去时，用它的原标题。',
        `例如"高等数学"的大纲开头是：${OUTLINE_EXAMPLE.zh}。`,
        '只返回 JSON：{"outline": [{"title": "...", "children": [{"title": "...", "children": []}]}]}。',
      ].join(''),
    labels: { subject: '导图名称', existing: '已有的知识点', toc: '教材目录', none: '（无）' },
  },
  en: {
    task: (toc: boolean) =>
      [
        "You lay out a subject as the outline of a learner's knowledge map: chapters, their topics, and at most one level below a topic. Titles are the subject's real chapter and topic names: short nouns, never questions, no numbering, in the language of the map's name. Never use titles that would fit any subject, such as Overview, Introduction, Summary, Applications or Methods. The outline holds structure only: no formulas, statements or explanations.",
        toc ? ' Follow the table of contents the learner pasted: its chapters and sections become the outline, in its order, titles shortened to nouns.' : ' Cover the subject as a standard course or textbook does: about 6–12 chapters with 2–8 topics each.',
        " Where one of the learner's existing sections fits, use its exact title.",
        ` For example, the outline of "Calculus" begins: ${OUTLINE_EXAMPLE.en}.`,
        ' Return JSON only: {"outline": [{"title": "...", "children": [{"title": "...", "children": []}]}]}.',
      ].join(''),
    labels: { subject: 'Map', existing: 'Existing sections', toc: 'Table of contents', none: '(none)' },
  },
} as const;

export function outlinePrompt(input: { lang: PromptLang; subject: string; existing: string[]; toc?: string }): ChatMessage[] {
  const t = OUTLINE_TEXT[input.lang];
  const l = t.labels;
  return [
    system('outline', t.task(!!input.toc)),
    {
      role: 'user',
      content: [`${l.subject}: ${input.subject}`, `${l.existing}:\n${input.existing.map((e) => `- ${e}`).join('\n') || l.none}`, ...(input.toc ? [`${l.toc}:\n${input.toc}`] : [])].join('\n\n'),
    },
  ];
}

/** Titles that fit any subject: an outline made of them is a template, not this subject's. */
const GENERIC_TITLES = new Set(
  'overview introduction scope history terminology landscape foundations principles concepts models frameworks core topics structure processes relationships variations methods inquiry analysis design measurement applications cases practice summary conclusion basics advanced topics 概述 简介 引言 绪论 总结 小结 应用 方法 基础 概念 原理 框架 实践 案例 历史 术语'
    .split(' ')
    .concat(['core topics', 'advanced topics']),
);
const hasCjk = (s: string) => /[㐀-鿿]/.test(s);

/**
 * A usable outline: at most a quarter of its titles generic, and its titles in the
 * script of the map's name (a Chinese name takes Chinese titles, a Latin one Latin).
 */
function checkOutline(outline: OutlineNode[], subject: string): void {
  const titles: string[] = [];
  const walk = (ns: OutlineNode[]) => ns.forEach((n) => (titles.push(n.title), walk(n.children)));
  walk(outline);
  const generic = titles.filter((t) => GENERIC_TITLES.has(t.trim().toLowerCase()));
  if (generic.length * 4 > titles.length) throw new LlmError(`The outline is a generic template (${generic.slice(0, 4).join(', ')}), not this subject's`);
  const cjk = titles.filter(hasCjk).length;
  const wantCjk = hasCjk(subject);
  if (wantCjk ? cjk * 2 < titles.length : cjk * 2 > titles.length) throw new LlmError(`The outline's titles are not in the language of "${subject}"`);
}

export function parseOutline(value: unknown, subject: string): OutlineNode[] {
  let count = 0;
  const nodes = (list: unknown, depth: number): OutlineNode[] => {
    if (!Array.isArray(list)) throw new LlmError('Expected a list of outline nodes');
    if (depth > OUTLINE_DEPTH && list.length) throw new LlmError(`The outline is deeper than ${OUTLINE_DEPTH} levels`);
    return list.map((item) => {
      const o = obj(item);
      if (++count > OUTLINE_MAX_NODES) throw new LlmError(`The outline has more than ${OUTLINE_MAX_NODES} nodes`);
      return { title: str(o, 'title'), children: o.children === undefined ? [] : nodes(o.children, depth + 1) };
    });
  };
  const outline = nodes(obj(value).outline, 1);
  if (!outline.length) throw new LlmError('The outline is empty');
  checkOutline(outline, subject);
  return outline;
}
