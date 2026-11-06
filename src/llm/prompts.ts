import type { ChatMessage } from './client';
import { LlmError } from './client';
import { obj, oneOf, str, strList } from './validate';
import type { OutlineNode } from '@/src/graph/tree';
import type { ItemType, StuckKind } from '@/src/db/types';

/**
 * Every prompt starts its system message with a `[task:<name>]` tag. Real models
 * ignore it; the mock server in tests routes on it.
 */
const system = (task: string, text: string): ChatMessage => ({ role: 'system', content: `[task:${task}]\n${text}` });

// ---------------------------------------------------------------- automatic placement

/** The language a prompt is written in, and asks the model to answer in. */
export type PromptLang = 'zh' | 'en';

export interface PlacementInput {
  lang: PromptLang;
  itemType: ItemType;
  text: string; // LaTeX for a formula, the recorded text for a statement, the exact words of a quote
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
  statement: string; // the one-sentence statement; "" for a formula or a quote
  mapName: string; // a name for an unnamed map; "" otherwise
}

export const MAX_PATH = 3;

const PLACE_TEXT = {
  zh: {
    task: (type: ItemType, unnamed: boolean) =>
      [
        '你负责把学习者的一条笔记放进他打开的这张知识导图。导图下面是章和知识点，标题都是简短的名词，不是问句。',
        '为这条笔记选出它在这张导图里的路径：1 到 3 层章 / 知识点标题。优先用已有位置（候选位置或导图结构里的原标题，一字不差）；都不合适时才新建知识点或章。新标题是简短的中文名词。学习者自己改过的位置说明了他的整理习惯，照着做。',
        type === 'statement'
          ? '再把笔记改写成一句保留原意的话（约 40 个汉字以内，公式写成 $...$）。如果笔记只是一个术语或名称，写成"术语：一句话解释"，解释根据上下文和你的知识。'
          : type === 'quote'
            ? '这条笔记是学习者要原样保留的原文：只决定它放在哪里，不改写、不总结，"statement" 填 ""。'
            : '这条笔记是公式，"statement" 填 ""。',
        unnamed ? '这张导图还没有名字：按这条笔记所属的学科或主题，起一个简短的中文名字填在 "mapName"。' : '"mapName" 填 ""。',
        '只返回 JSON：{"path": ["..."], "statement": "...", "mapName": "..."}。',
      ].join(''),
    labels: { note: '笔记', formula: '公式', statement: '文字', quote: '原文', context: '上下文', now: '现在在', candidates: '候选位置', map: '导图', unnamed: '（未命名）', outline: '导图结构', examples: '学习者改过的位置', none: '（无）' },
  },
  en: {
    task: (type: ItemType, unnamed: boolean) =>
      [
        "You file one of a learner's notes into the knowledge map they have open. Below the map are chapters and topics; their titles are short nouns, never questions.",
        ' Choose the note\'s path in this map: 1–3 chapter / topic titles. Prefer an existing place (a candidate or a path from the map\'s outline, with the exact titles); add a new topic or chapter only when nothing fits. New titles are short English nouns. The learner\'s own corrections show how they organize notes; follow them.',
        type === 'statement'
          ? ' Also rewrite the note as one plain sentence that keeps its claim (about 20 words at most, formulas as $...$). If the note is only a term or a name, write "term: a one-sentence explanation", drawn from the context and your knowledge.'
          : type === 'quote'
            ? ' The note is a quote the learner keeps word for word: only choose its place, never rewrite or summarize it; "statement" is "".'
            : ' The note is a formula: "statement" is "".',
        unnamed ? ' The map has no name yet: give it a short English name for the subject or topic this note belongs to, in "mapName".' : ' "mapName" is "".',
        ' Return JSON only: {"path": ["..."], "statement": "...", "mapName": "..."}.',
      ].join(''),
    labels: { note: 'Note', formula: 'formula', statement: 'text', quote: 'quote', context: 'Context', now: 'Now in', candidates: 'Candidates', map: 'Map', unnamed: '(unnamed)', outline: "The map's outline", examples: "The learner's corrections", none: '(none)' },
  },
} as const;

export function placePrompt(input: PlacementInput): ChatMessage[] {
  const t = PLACE_TEXT[input.lang];
  const l = t.labels;
  const examples = input.examples.length ? input.examples.map((e) => `- ${e.text} → ${e.path.join(' › ')}`).join('\n') : l.none;
  return [
    system('place', t.task(input.itemType, !input.map)),
    {
      role: 'user',
      content: [
        `${l.note} (${l[input.itemType]}): ${input.text}`,
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

/** Only a statement takes the model's sentence; a formula and a protected quote keep their own words. */
export function parsePlacement(value: unknown, itemType: ItemType, unnamed: boolean): PlacementReply {
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

// ---------------------------------------------------------------- asking about a selection (the floating window)

export interface AskTurn {
  question: string;
  answer: string;
}

export interface AskInput {
  lang: PromptLang;
  selection: string; // what the learner selected, as Markdown
  before: string; // the conversation just around it
  after: string;
  pageTitle: string;
  turns: AskTurn[]; // earlier questions in this window, with their answers
  question: string;
}

const ASK_TEXT = {
  zh: {
    task: '学习者在和 AI 的对话里选中了一段内容，就它提一个小问题。像一位耐心的老师那样，围绕选中的内容直接回答：先给结论，再用一两句解释为什么，一般 2–6 句，不要客套，不要标题。公式写成 $...$（单独成行的写成 $$...$$）。学习者追问时接着前面的回答说。用中文回答。',
    selected: '选中的内容',
    context: '上下文',
    page: '页面',
  },
  en: {
    task: 'A learner selected a passage in a conversation with an AI and asks a short question about it. Answer like a patient teacher, about the selection: the answer first, then a sentence or two on why; usually 2–6 sentences, no pleasantries, no headings. Write formulas as $...$ (a displayed one as $$...$$). When the learner follows up, build on your earlier answers. Answer in English.',
    selected: 'Selected',
    context: 'Context',
    page: 'Page',
  },
} as const;

/** The selection and its context go first; then each question of this window, with the answers given so far. */
export function askPrompt(input: AskInput): ChatMessage[] {
  const t = ASK_TEXT[input.lang];
  const intro = [`${t.selected}:\n${input.selection}`, `${t.context}: …${input.before.trim()} [SELECTED] ${input.after.trim()}…`, `${t.page}: ${input.pageTitle}`].join('\n\n');
  const turns = [...input.turns, { question: input.question, answer: '' }];
  return [
    system('ask', t.task),
    ...turns.flatMap((turn, i): ChatMessage[] => [
      { role: 'user', content: i === 0 ? `${intro}\n\n${turn.question}` : turn.question },
      ...(turn.answer ? [{ role: 'assistant' as const, content: turn.answer }] : []),
    ]),
  ];
}

// ---------------------------------------------------------------- is the learner stuck? (every 5 new questions in a map)

export const STUCK_KINDS = ['circling', 'stuck', 'offTarget', 'phrasing'] as const satisfies readonly StuckKind[];

export interface StuckInput {
  lang: PromptLang;
  map: string; // the map's name, '' when unnamed
  asks: { text: string; conversation: string; window: boolean }[]; // oldest first; `conversation` tells conversations apart
  sections: string[]; // the map's topics, "chapter › topic"
}

export type StuckReply =
  | { stuck: false }
  | { stuck: true; kind: StuckKind; section: number; explanation: string; question: string; evidence: number[] }; // section: 0-based, -1 for none; evidence: 0-based

const STUCK_TEXT = {
  zh: {
    task: [
      '你在旁边看一位学习者向 AI 提问，帮他发现自己是不是卡住了。下面是他在一张知识导图里最近的提问（按时间编号，按对话分段，“浮窗”是他针对页面上选中内容问的），后面是这张导图里的知识点（编号）。',
      '判断这些提问是否显出下面一种情况：circling（同一个点换着说法反复问，一直没弄懂）；stuck（被前面某个没弄懂的知识点挡住，后面的问题都绕不过去）；offTarget（问的和他真正不懂的地方不是一回事，问不到点子上）；phrasing（不会组织问题，问得含糊、宽泛，得不到有用的回答）。一步步往下学、每个问题都有进展，就是没有卡住；拿不准时也算没有卡住。',
      '卡住时："kind" 是上面四个词之一；"section" 是最相关的知识点编号，没有合适的填 0；"explanation" 用两三句话温和地说：看到了什么、可能卡在哪里、先弄清什么（不评判，不打分）；"question" 是一个他可以直接发给 AI 的更好的问法，具体、能回答，用他的语言；"evidence" 是体现这一点的提问编号。',
      '只返回 JSON：卡住时 {"stuck": true, "kind": "...", "section": 0, "explanation": "...", "question": "...", "evidence": [1]}，没有卡住时 {"stuck": false}。用中文写。',
    ].join(''),
    map: '导图',
    unnamed: '（未命名）',
    asks: '提问',
    conversation: (n: number) => `对话 ${n}`,
    window: '（浮窗）',
    sections: '知识点',
    none: '（无）',
  },
  en: {
    task: [
      "You watch over a learner's questions to an AI and help them notice when they are stuck. Below are their latest questions in one knowledge map (numbered in order, grouped by conversation; \"window\" marks a question about something they selected on the page), then the map's topics (numbered).",
      ' Decide whether the questions show one of these: circling (asking about the same point again and again in other words, never getting it); stuck (held up by an earlier topic they have not understood, so the later questions cannot get past it); offTarget (asking about something other than what they actually do not understand); phrasing (questions too vague or broad to get a useful answer). Moving on step by step with each question making progress is not stuck; when unsure, it is not stuck.',
      ' When stuck: "kind" is one of the four words above; "section" is the number of the most relevant topic, 0 if none fits; "explanation" says gently, in two or three sentences, what you noticed, where they may be stuck and what to get clear first (no judging, no scores); "question" is a better question they can send to the AI as it is, concrete and answerable, in their language; "evidence" lists the numbers of the questions that show it.',
      ' Return JSON only: when stuck {"stuck": true, "kind": "...", "section": 0, "explanation": "...", "question": "...", "evidence": [1]}, otherwise {"stuck": false}. Write in English.',
    ].join(''),
    map: 'Map',
    unnamed: '(unnamed)',
    asks: 'Questions',
    conversation: (n: number) => `Conversation ${n}`,
    window: ' (window)',
    sections: 'Topics',
    none: '(none)',
  },
} as const;

export function stuckPrompt(input: StuckInput): ChatMessage[] {
  const t = STUCK_TEXT[input.lang];
  const lines: string[] = [];
  let conversation: string | undefined;
  let n = 0;
  input.asks.forEach((a, i) => {
    if (a.conversation !== conversation) {
      conversation = a.conversation;
      lines.push(`${t.conversation(++n)}`);
    }
    lines.push(`[${i + 1}] ${a.text.replace(/\s+/g, ' ').trim()}${a.window ? t.window : ''}`);
  });
  const sections = input.sections.map((s, i) => `[${i + 1}] ${s}`).join('\n') || t.none;
  return [
    system('stuck', t.task),
    { role: 'user', content: `${t.map}: ${input.map || t.unnamed}\n\n${t.asks}:\n${lines.join('\n')}\n\n${t.sections}:\n${sections}` },
  ];
}

const number = (v: unknown, min: number, max: number, what: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new LlmError(`Unexpected ${what} ${String(v)}`);
  return v;
};

export function parseStuck(value: unknown, askCount: number, sectionCount: number): StuckReply {
  const o = obj(value);
  if (typeof o.stuck !== 'boolean') throw new LlmError('Expected boolean "stuck"');
  if (!o.stuck) return { stuck: false };
  const evidence = o.evidence;
  if (!Array.isArray(evidence) || !evidence.length) throw new LlmError('Expected a non-empty "evidence" list');
  return {
    stuck: true,
    kind: oneOf(o, 'kind', STUCK_KINDS),
    section: number(o.section, 0, sectionCount, 'section') - 1,
    explanation: str(o, 'explanation'),
    question: str(o, 'question'),
    evidence: [...new Set(evidence.map((e) => number(e, 1, askCount, 'question number') - 1))].sort((x, y) => x - y),
  };
}
