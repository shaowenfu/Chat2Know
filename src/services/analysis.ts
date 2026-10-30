import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import { linkConcepts } from './linking';
import { tagBatch } from './tagging';

/** Untagged questions that start an analysis on their own. */
export const AUTO_ANALYZE_AT = 10;

/**
 * The learning-diagnosis pipeline: tag every waiting question with its concepts,
 * then link the concepts to note cards (`embeddingModel` empty: by name only).
 */
export async function analyze(repo: Repository, client: LlmClient, embeddingModel: string): Promise<void> {
  while (await tagBatch(repo, client));
  await linkConcepts(repo, client, embeddingModel);
}
