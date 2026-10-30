import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import { tagBatch } from './tagging';

/** Untagged questions that start an analysis on their own. */
export const AUTO_ANALYZE_AT = 10;

/** The learning-diagnosis pipeline: tag every waiting question with its concepts. */
export async function analyze(repo: Repository, client: LlmClient): Promise<void> {
  while (await tagBatch(repo, client));
}
