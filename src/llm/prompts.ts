import type { ChatMessage } from './client';
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
