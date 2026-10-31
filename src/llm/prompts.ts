import type { ChatMessage } from './client';
import { LlmError } from './client';
import { obj, str, strList } from './validate';

/**
 * Every prompt starts its system message with a `[task:<name>]` tag. Real models
 * ignore it; the mock server in tests routes on it.
 */
const system = (task: string, text: string): ChatMessage => ({ role: 'system', content: `[task:${task}]\n${text}` });

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

// ---------------------------------------------------------------- circling: the concept behind a run of questions

export function circlingPrompt(input: { asks: string[]; known: { domain: string; names: string[] }[] }): ChatMessage[] {
  const known = input.known.length ? input.known.map((d) => `${d.domain}: ${d.names.join('; ')}`).join('\n') : '(none yet)';
  return [
    system(
      'circling',
      `A learner asked these questions one after another in one conversation, rephrasing without getting unstuck. Answered one by one each looks fine; looked at together they may share one more fundamental concept which, once understood, resolves all of them (for example, layout conventions behind confusion about transposes and dimensions in matrix derivatives). Name that concept as a teachable unit, with its domain; reuse a known name exactly when it fits. If there is no single underlying concept, return an empty concept. Return JSON only: {"domain": "...", "concept": "..."}. Names in the language of the questions.\n\nKnown concepts by domain:\n${known}`,
    ),
    { role: 'user', content: input.asks.map((a, i) => `[${i + 1}] ${a}`).join('\n') },
  ];
}

export function parseCircling(value: unknown): { domain: string; concept: string } | null {
  const o = obj(value);
  if (typeof o.concept === 'string' && !o.concept.trim()) return null;
  return { domain: str(o, 'domain'), concept: str(o, 'concept') };
}

