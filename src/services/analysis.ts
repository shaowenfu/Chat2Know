import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import { diagnose } from './diagnose';
import { linkConcepts } from './linking';
import { tagBatch } from './tagging';

/** Untagged questions that start an analysis on their own. */
export const AUTO_ANALYZE_AT = 10;

/**
 * The learning-diagnosis pipeline: tag every waiting question with its concepts,
 * link the concepts to note cards, then look for gaps (`embeddingModel` empty:
 * links by name only, no circling). Returns how many new diagnoses it made.
 */
export async function analyze(repo: Repository, client: LlmClient, embeddingModel: string, now: number): Promise<number> {
  while (await tagBatch(repo, client));
  await linkConcepts(repo, client, embeddingModel);
  return (await diagnose(repo, client, embeddingModel, now)).length;
}
