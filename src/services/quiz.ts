import type { LlmClient } from '@/src/llm/client';
import { judgePrompt, parseJudgement } from '@/src/llm/prompts';
import type { Repository } from '@/src/db/repository';
import type { KNode, Review, Verdict } from '@/src/db/types';

/** What the learner is expected to recall: the kept statement, or the raw text when there is none. */
export function expectedAnswer(node: KNode): string {
  const expected = node.summary ?? node.body;
  if (!expected) throw new Error('Card has nothing to check against');
  return expected;
}

export async function selfGrade(repo: Repository, nodeId: string, answer: string, verdict: Verdict): Promise<Review> {
  const node = await repo.getNode(nodeId);
  if (!node) throw new Error('Card not found');
  return repo.recordReview({ nodeId, prompt: node.title, answer, verdict });
}

/** Lets the model compare the answer with the kept statement; its verdict is recorded as the review. */
export async function judge(repo: Repository, client: LlmClient, nodeId: string, answer: string): Promise<Review> {
  const node = await repo.getNode(nodeId);
  if (!node) throw new Error('Card not found');
  const { verdict, feedback } = await client.json(
    judgePrompt({ question: node.title, expected: expectedAnswer(node), answer }),
    parseJudgement,
  );
  return repo.recordReview({ nodeId, prompt: node.title, answer, verdict, feedback });
}
