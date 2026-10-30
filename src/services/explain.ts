import { UserError } from '@/src/errors';
import type { LlmClient } from '@/src/llm/client';
import { explainPrompt, oneMinutePrompt, parseExplanationCheck } from '@/src/llm/prompts';
import type { Repository } from '@/src/db/repository';
import type { Verdict } from '@/src/db/types';
import { statementOf } from './quiz';

/** More points than this do not fit one explanation; explain a smaller branch. */
export const MAX_EXPLAIN_POINTS = 20;

export interface ExplainResult {
  feedback: string;
  points: { nodeId: string; title: string; verdict: Verdict; feedback: string }[];
}

/** The branch's title and its kept cards with their statements. */
async function branchPoints(repo: Repository, rootId: string) {
  const branch = await repo.subtree(rootId);
  const cards = branch.filter((n) => n.type === 'knowledge' && n.status !== 'draft');
  if (!cards.length) throw new Error('Nothing kept here to explain');
  if (cards.length > MAX_EXPLAIN_POINTS) throw new UserError('explain.tooBig', [String(cards.length), String(MAX_EXPLAIN_POINTS)]);
  return { topic: branch[0]!.title, cards, points: cards.map((n) => ({ title: n.title, statement: statementOf(n) })) };
}

/** "Explain it in one minute": a script to say out loud, written from the branch's statements. Not stored. */
export async function oneMinuteScript(repo: Repository, client: LlmClient, rootId: string): Promise<string> {
  const { topic, points } = await branchPoints(repo, rootId);
  return client.chat(oneMinutePrompt({ topic, points }));
}

/**
 * "Explain it to me": the learner explains a card and its branch; the model checks
 * every kept card in it. Each card gets an explain review, so missed ones show on
 * the map until they are checked again.
 */
export async function checkExplanation(repo: Repository, client: LlmClient, rootId: string, explanation: string): Promise<ExplainResult> {
  const text = explanation.trim();
  if (!text) throw new UserError('explain.empty');
  const { topic, cards, points: wanted } = await branchPoints(repo, rootId);
  const check = await client.json(
    explainPrompt({ topic, points: wanted, explanation: text }),
    (v) => parseExplanationCheck(v, cards.length),
  );
  const points = cards.map((n, i) => ({ nodeId: n.id, title: n.title, ...check.points[i]! }));
  for (const p of points) {
    await repo.recordReview({ nodeId: p.nodeId, mode: 'explain', prompt: topic, answer: text, verdict: p.verdict, feedback: p.feedback });
  }
  return { feedback: check.feedback, points };
}
