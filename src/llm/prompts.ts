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

export interface PlacementInput {
  itemType: 'formula' | 'statement';
  text: string; // LaTeX for a formula, the recorded text for a statement
  before: string; // the conversation just before it
  after: string;
  now: string; // where it sits now, "subject › … › topic"
  candidates: string[]; // the closest topics, "subject › … › topic"
  subjects: string; // every subject's chapters and topics, indented titles
  examples: { text: string; path: string[] }[]; // where the user moved earlier notes
}

export interface PlacementReply {
  subject: string;
  path: string[]; // 1–3 chapter / topic titles below the subject
  statement: string; // the one-sentence statement; "" for a formula
}

export const MAX_PATH = 3;

export function placePrompt(input: PlacementInput): ChatMessage[] {
  const examples = input.examples.length ? input.examples.map((e) => `- ${e.text} → ${e.path.join(' › ')}`).join('\n') : '(none yet)';
  return [
    system(
      'place',
      `You file one note into a learner's knowledge maps. Each subject (such as "Linear algebra") has chapters and topics; their titles are short nouns, never questions. Choose the subject and the path of 1–3 chapter / topic titles below it where the note belongs. Prefer an existing place: use a candidate or a path from the subjects' outline with the exact titles. Add a new topic (or chapter) only when nothing fits, and a new subject only when the note belongs to none. New titles are short nouns in the language of the note. The user's own corrections below show how they organize notes; follow them. ${
        input.itemType === 'statement'
          ? 'Also rewrite the note as one plain sentence that keeps its claim (about 40 Chinese characters or 20 English words at most), formulas as $...$, in the note\'s language.'
          : 'The note is a formula: "statement" is "".'
      } Return JSON only: {"subject": "...", "path": ["..."], "statement": "..."}.`,
    ),
    {
      role: 'user',
      content: [
        `Note (${input.itemType}): ${input.text}`,
        `Context: …${input.before} [NOTE] ${input.after}…`,
        `Now in: ${input.now}`,
        `Candidates:\n${input.candidates.map((c) => `- ${c}`).join('\n') || '(none)'}`,
        `Subjects:\n${input.subjects || '(none yet)'}`,
        `The user's corrections:\n${examples}`,
      ].join('\n\n'),
    },
  ];
}

export function parsePlacement(value: unknown, itemType: 'formula' | 'statement'): PlacementReply {
  const o = obj(value);
  const path = strList(o, 'path');
  if (path.length < 1 || path.length > MAX_PATH) throw new LlmError(`Expected 1–${MAX_PATH} titles in "path"`);
  const statement = itemType === 'statement' ? str(o, 'statement') : '';
  return { subject: str(o, 'subject'), path, statement };
}

// ---------------------------------------------------------------- outline

/** Chapters, topics and one more level at most: the subject plus three levels. */
export const OUTLINE_DEPTH = 3;
const OUTLINE_MAX_NODES = 200;

export function outlinePrompt(input: { subject: string; existing: string[]; toc?: string }): ChatMessage[] {
  return [
    system(
      'outline',
      `You lay out a subject as the outline of a learner's knowledge map: chapters, their topics, and at most one level below a topic. Titles are short nouns (never questions), no numbering, in the language of the subject's name. The outline holds structure only: no formulas, statements or explanations. ${
        input.toc
          ? 'Follow the table of contents the learner pasted: its chapters and sections become the outline, in its order, titles shortened to nouns.'
          : 'Cover the subject as a standard course or textbook does: about 6–12 chapters with 2–8 topics each.'
      } Where one of the learner's existing sections fits, use its exact title. Return JSON only: {"outline": [{"title": "...", "children": [{"title": "...", "children": []}]}]}.`,
    ),
    {
      role: 'user',
      content: [`Subject: ${input.subject}`, `Existing sections:\n${input.existing.map((e) => `- ${e}`).join('\n') || '(none)'}`, ...(input.toc ? [`Table of contents:\n${input.toc}`] : [])].join('\n\n'),
    },
  ];
}

export function parseOutline(value: unknown): OutlineNode[] {
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
  return outline;
}
