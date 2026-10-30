import type { LlmClient } from '@/src/llm/client';
import { applyJudgePrompt, judgePrompt, parseJudgement, problemPrompt } from '@/src/llm/prompts';
import type { Repository } from '@/src/db/repository';
import type { KNode, Review, Verdict } from '@/src/db/types';

/** What the learner is expected to know: the kept statement, or the raw text when there is none. */
export function statementOf(node: KNode): string {
  const expected = node.summary ?? node.body;
  if (!expected) throw new Error('Card has nothing to check against');
  return expected;
}

async function card(repo: Repository, nodeId: string): Promise<KNode> {
  const node = await repo.getNode(nodeId);
  if (!node) throw new Error('Card not found');
  return node;
}

export async function selfGrade(repo: Repository, nodeId: string, answer: string, verdict: Verdict): Promise<Review> {
  const node = await card(repo, nodeId);
  return repo.recordReview({ nodeId, mode: 'recall', prompt: node.title, answer, verdict });
}

/** A fresh problem that needs the card's knowledge to solve ("use it"). */
export async function problemFor(repo: Repository, client: LlmClient, nodeId: string): Promise<string> {
  const node = await card(repo, nodeId);
  return client.chat(problemPrompt({ question: node.title, statement: statementOf(node) }));
}

/**
 * Lets the model judge the answer and records its verdict: against the kept
 * statement for recall, or as a solution to `problem` for apply.
 */
export async function judge(repo: Repository, client: LlmClient, nodeId: string, answer: string, problem?: string): Promise<Review> {
  const node = await card(repo, nodeId);
  const statement = statementOf(node);
  const messages = problem
    ? applyJudgePrompt({ problem, statement, answer })
    : judgePrompt({ question: node.title, expected: statement, answer });
  const { verdict, feedback } = await client.json(messages, parseJudgement);
  return repo.recordReview({ nodeId, mode: problem ? 'apply' : 'recall', prompt: problem ?? node.title, answer, verdict, feedback });
}
