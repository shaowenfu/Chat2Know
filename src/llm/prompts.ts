import type { ChatMessage } from './client';
import { LlmError } from './client';
import { obj, oneOf, str, strList } from './validate';

/**
 * Every prompt starts its system message with a `[task:<name>]` tag. Real models
 * ignore it; the mock server in tests routes on it.
 */
const system = (task: string, text: string): ChatMessage => ({ role: 'system', content: `[task:${task}]\n${text}` });

const SAME_LANGUAGE = 'Write in the same language as the user material (Chinese stays Chinese, English stays English).';

// ---------------------------------------------------------------- answer

export interface AnswerInput {
  question: string;
  quote: string;
  context?: string; // title of the question this one arose from
}

export function answerPrompt(input: AnswerInput): ChatMessage[] {
  return [
    system(
      'answer',
      `You are a concise tutor helping someone who is reading an AI conversation. Answer the question about the quoted sentence in 2–6 sentences of plain Markdown. Explain in the context of the sentence, not as a generic encyclopedia entry. ${SAME_LANGUAGE}`,
    ),
    {
      role: 'user',
      content: [
        `Sentence I was reading:\n> ${input.quote}`,
        input.context ? `I was exploring: ${input.context}` : '',
        `My question: ${input.question}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

// ---------------------------------------------------------------- recording suggestion

export const SUGGESTION_KINDS = ['concept', 'instance', 'curiosity'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export interface Suggestion {
  kind: SuggestionKind;
  titles: string[]; // 3 question-form candidates worth reviewing
  summary: string; // 1–3 sentence statement to keep
  concept?: string; // for instances: the concept this is an example of
}

export interface SuggestInput {
  question: string;
  quote: string;
  answer: string;
  /** Earlier user decisions, used as examples of what this user keeps or drops. */
  examples: { kind: SuggestionKind; suggested: string; action: 'accept' | 'edit' | 'delete'; final?: string }[];
}

export function suggestPrompt(input: SuggestInput): ChatMessage[] {
  const examples = input.examples.length
    ? `\n\nThis user's earlier decisions on suggestions (follow their taste; never suggest again what they deleted):\n${input.examples
        .map((e) => `- [${e.kind}] suggested: ${e.suggested} → ${e.action}${e.final ? `: ${e.final}` : ''}`)
        .join('\n')}`
    : '';
  return [
    system(
      'suggest',
      `Decide what, if anything, is worth keeping from a Q&A for later study. Classify the question:
- "concept": a concept or mechanism. Keep transferable structure (parts, roles, causes), not a literal definition.
- "instance": a specific example or fact (a model, product, paper). Keep at most that it is an example of a concept; drop fast-changing facts like organizations, dates, capabilities.
- "curiosity": one-off curiosity (a name's origin, trivia). Suggest not keeping.
Return JSON only: {"kind": "...", "titles": [three questions worth reviewing, each better than the original question], "summary": "1–3 sentence statement of what to keep", "concept": "only for instance: the concept name"}.
${SAME_LANGUAGE}${examples}`,
    ),
    { role: 'user', content: `Question: ${input.question}\n\nContext sentence:\n> ${input.quote}\n\nAnswer:\n${input.answer}` },
  ];
}

export function parseSuggestion(value: unknown): Suggestion {
  const o = obj(value);
  const kind = oneOf(o, 'kind', SUGGESTION_KINDS);
  return {
    kind,
    titles: strList(o, 'titles', 3),
    summary: str(o, 'summary'),
    ...(kind === 'instance' ? { concept: str(o, 'concept') } : {}),
  };
}

// ---------------------------------------------------------------- distill

export interface Distillation {
  titles: string[];
  summary: string;
}

export function distillPrompt(markdown: string): ChatMessage[] {
  return [
    system(
      'distill',
      `Distill a passage the user saved. Return JSON only: {"titles": [three questions this passage answers, each worth reviewing later], "summary": "1–3 sentence statement of the transferable point"}. Keep formulas in LaTeX. ${SAME_LANGUAGE}`,
    ),
    { role: 'user', content: markdown },
  ];
}

export function parseDistillation(value: unknown): Distillation {
  const o = obj(value);
  return { titles: strList(o, 'titles', 3), summary: str(o, 'summary') };
}

// ---------------------------------------------------------------- judge (quiz me)

export const VERDICTS = ['pass', 'partial', 'fail'] as const;

export interface Judgement {
  verdict: (typeof VERDICTS)[number];
  feedback: string;
}

export function judgePrompt(input: { question: string; expected: string; answer: string }): ChatMessage[] {
  return [
    system(
      'judge',
      `You check a learner's recall. Compare their answer with the expected answer on meaning, not wording. "pass": the key points are there and correct. "partial": some key points missing or vague. "fail": wrong or mostly missing. Return JSON only: {"verdict": "pass" | "partial" | "fail", "feedback": "one or two sentences naming what was missing or wrong"}. ${SAME_LANGUAGE}`,
    ),
    { role: 'user', content: `Question: ${input.question}\n\nExpected answer:\n${input.expected}\n\nLearner's answer:\n${input.answer}` },
  ];
}

export function parseJudgement(value: unknown): Judgement {
  const o = obj(value);
  return { verdict: oneOf(o, 'verdict', VERDICTS), feedback: str(o, 'feedback') };
}

// ---------------------------------------------------------------- apply (use it to solve a problem)

export function problemPrompt(input: { question: string; statement: string }): ChatMessage[] {
  return [
    system(
      'problem',
      `Write one short problem (2–4 sentences) that the learner can only solve by using the knowledge below: a concrete situation, case or small calculation, not a request to restate the knowledge. Do not include the answer or hints. Reply with the problem only, in plain Markdown, formulas in LaTeX. ${SAME_LANGUAGE}`,
    ),
    { role: 'user', content: `Knowledge question: ${input.question}\n\nKnowledge:\n${input.statement}` },
  ];
}

export function applyJudgePrompt(input: { problem: string; statement: string; answer: string }): ChatMessage[] {
  return [
    system(
      'judgeApply',
      `You check whether a learner used a piece of knowledge correctly to solve a problem. "pass": the solution is correct and uses the knowledge. "partial": on the right track but incomplete or with a slip. "fail": wrong, or the knowledge is not used. Return JSON only: {"verdict": "pass" | "partial" | "fail", "feedback": "one or two sentences: what was right, what was missing or wrong"}. ${SAME_LANGUAGE}`,
    ),
    { role: 'user', content: `Problem:\n${input.problem}\n\nKnowledge it needs:\n${input.statement}\n\nLearner's solution:\n${input.answer}` },
  ];
}

// ---------------------------------------------------------------- explain it to me

export interface PointCheck {
  verdict: (typeof VERDICTS)[number];
  feedback: string;
}

export interface ExplanationCheck {
  feedback: string;
  points: PointCheck[]; // one per point, in the order given
}

export function explainPrompt(input: { topic: string; points: { title: string; statement: string }[]; explanation: string }): ChatMessage[] {
  return [
    system(
      'explain',
      `A learner explains a topic in their own words, as if teaching it. Check the explanation against each numbered point. "pass": the point is explained correctly. "partial": touched on but incomplete or vague. "fail": missing or wrong. Judge meaning, not wording; do not require the points' exact phrasing. Return JSON only: {"feedback": "two or three sentences on the explanation as a whole", "points": [{"point": 1, "verdict": "pass" | "partial" | "fail", "feedback": "one sentence: what was missing or wrong, or what was good"}]} with every point exactly once. ${SAME_LANGUAGE}`,
    ),
    {
      role: 'user',
      content: `Topic: ${input.topic}\n\nPoints to cover:\n${input.points.map((p, i) => `[${i + 1}] ${p.title} — ${p.statement}`).join('\n')}\n\nExplanation:\n${input.explanation}`,
    },
  ];
}

export function parseExplanationCheck(value: unknown, pointCount: number): ExplanationCheck {
  const o = obj(value);
  const list = o.points;
  if (!Array.isArray(list)) throw new LlmError('Expected "points" to be a list');
  const byPoint = new Map<number, PointCheck>();
  for (const item of list) {
    const p = obj(item);
    const n = p.point;
    if (typeof n !== 'number' || n < 1 || n > pointCount || byPoint.has(n)) throw new LlmError(`Unexpected point ${String(n)}`);
    byPoint.set(n, { verdict: oneOf(p, 'verdict', VERDICTS), feedback: str(p, 'feedback') });
  }
  if (byPoint.size !== pointCount) throw new LlmError(`Expected ${pointCount} points, got ${byPoint.size}`);
  return { feedback: str(o, 'feedback'), points: Array.from({ length: pointCount }, (_, i) => byPoint.get(i + 1)!) };
}

// ---------------------------------------------------------------- one-minute script

export function oneMinutePrompt(input: { topic: string; points: { title: string; statement: string }[] }): ChatMessage[] {
  return [
    system(
      'oneMinute',
      `Write a script the learner can say out loud in about one minute (about 150 English words, or about 250 Chinese characters) that explains the topic using the points below. Start with the core answer in one sentence, then the key points in a natural order, and end with one sentence on when it applies or its limits. Plain spoken sentences: no headings, no lists, no Markdown. Do not add facts beyond the points. ${SAME_LANGUAGE}`,
    ),
    { role: 'user', content: `Topic: ${input.topic}\n\nPoints:\n${input.points.map((p) => `- ${p.title} — ${p.statement}`).join('\n')}` },
  ];
}

// ---------------------------------------------------------------- concept tags (learning diagnosis)

export interface AskTagging {
  domain: string; // empty when the question has no concepts
  concepts: string[];
}

export function tagPrompt(input: { asks: string[]; known: { domain: string; names: string[] }[] }): ChatMessage[] {
  const known = input.known.length ? input.known.map((d) => `${d.domain}: ${d.names.join('; ')}`).join('\n') : '(none yet)';
  return [
    system(
      'tag',
      `A learner asked an AI the numbered questions below. For each, name the knowledge domain (such as "Linear algebra" or "Matrix calculus") and the 1–3 specific concepts it is about (such as "Transpose properties" or "Order of matrix multiplication"): teachable units, not the whole domain and not the exercise itself. Reuse a known concept or domain name exactly when it fits; otherwise give a short new name at the same granularity. A question that is not about learnable knowledge (chit-chat, formatting or writing requests) gets "domain": "" and no concepts. Return JSON only: {"tags": [{"ask": 1, "domain": "...", "concepts": ["..."]}]} with every question exactly once. Names in the language of the questions.\n\nKnown concepts by domain:\n${known}`,
    ),
    { role: 'user', content: input.asks.map((a, i) => `[${i + 1}] ${a}`).join('\n') },
  ];
}

export function parseTags(value: unknown, askCount: number): AskTagging[] {
  const list = obj(value).tags;
  if (!Array.isArray(list)) throw new LlmError('Expected "tags" to be a list');
  const byAsk = new Map<number, AskTagging>();
  for (const item of list) {
    const t = obj(item);
    const n = t.ask;
    if (typeof n !== 'number' || n < 1 || n > askCount || byAsk.has(n)) throw new LlmError(`Unexpected ask ${String(n)}`);
    const concepts = Array.isArray(t.concepts) && t.concepts.length === 0 ? [] : strList(t, 'concepts');
    byAsk.set(n, { domain: concepts.length ? str(t, 'domain') : '', concepts });
  }
  if (byAsk.size !== askCount) throw new LlmError(`Expected ${askCount} tagged questions, got ${byAsk.size}`);
  return Array.from({ length: askCount }, (_, i) => byAsk.get(i + 1)!);
}

// ---------------------------------------------------------------- prerequisite graph

export interface GraphAddition {
  concepts: string[];
  edges: { from: string; to: string }[];
}

export function prereqPrompt(input: { domain: string; existing: string[]; existingEdges: { from: string; to: string }[]; required: string[] }): ChatMessage[] {
  const isNew = input.existing.length === 0;
  return [
    system(
      'prereq',
      `You build the prerequisite graph of a knowledge domain, used to find the foundations a learner is missing. Concepts are specific, teachable units. An edge {"from": A, "to": B} means A must be understood before B. ${
        isNew
          ? 'This is a new domain: give its core concepts from the foundations up (about 10–30 in total), including every required concept by its exact name.'
          : 'Extend the existing graph: add every required concept by its exact name, plus only the missing prerequisites that connect them to the existing concepts.'
      } Refer to existing concepts by their exact names. No cycles. Return JSON only: {"concepts": ["names of the concepts you add"], "edges": [{"from": "...", "to": "..."}]}. Names in the language of the required concepts.`,
    ),
    {
      role: 'user',
      content: [
        `Domain: ${input.domain}`,
        isNew ? '' : `Existing concepts: ${input.existing.join('; ')}`,
        isNew || !input.existingEdges.length ? '' : `Existing edges:\n${input.existingEdges.map((e) => `${e.from} -> ${e.to}`).join('\n')}`,
        `Required concepts: ${input.required.join('; ')}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

/** Validates a graph addition: every required concept is present, every edge joins known concepts. Cycles are checked by the caller on the merged graph. */
export function parseGraphAddition(value: unknown, existing: string[], required: string[], key: (name: string) => string): GraphAddition {
  const o = obj(value);
  const concepts = Array.isArray(o.concepts) && o.concepts.length === 0 ? [] : strList(o, 'concepts');
  if (!Array.isArray(o.edges)) throw new LlmError('Expected "edges" to be a list');
  const known = new Set([...existing, ...concepts].map(key));
  const edges = o.edges.map((e) => {
    const x = obj(e);
    const edge = { from: str(x, 'from'), to: str(x, 'to') };
    for (const end of [edge.from, edge.to]) if (!known.has(key(end))) throw new LlmError(`Edge names an unknown concept "${end}"`);
    if (key(edge.from) === key(edge.to)) throw new LlmError(`"${edge.from}" cannot be its own prerequisite`);
    return edge;
  });
  for (const r of required) if (!known.has(key(r))) throw new LlmError(`Graph is missing the required concept "${r}"`);
  return { concepts, edges };
}

// ---------------------------------------------------------------- organize (whole page / paste)

export interface CandidateCard {
  question: string;
  summary: string;
  quote: string; // verbatim excerpt from the text, used as provenance
}

export const MAX_CANDIDATES = 12;

export function organizePrompt(text: string): ChatMessage[] {
  return [
    system(
      'organize',
      `The user gives you an AI conversation (or part of one) as text. Split it into question-and-answer turns, then propose cards worth keeping for later study: transferable concepts, mechanisms and conclusions, not filler, not fast-changing facts. At most ${MAX_CANDIDATES} cards; zero is fine. Return JSON only: {"cards": [{"question": "a question worth reviewing", "summary": "1–3 sentence statement answering it", "quote": "a short excerpt copied verbatim from the text that supports it"}]}. Keep formulas in LaTeX. ${SAME_LANGUAGE}`,
    ),
    { role: 'user', content: text },
  ];
}

export function parseCandidates(value: unknown): CandidateCard[] {
  const cards = obj(value).cards;
  if (!Array.isArray(cards)) throw new LlmError('Expected "cards" to be a list');
  return cards.map((c) => {
    const o = obj(c);
    return { question: str(o, 'question'), summary: str(o, 'summary'), quote: str(o, 'quote') };
  });
}
