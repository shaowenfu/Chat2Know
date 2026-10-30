import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import { diagnose } from './diagnose';
import { linkConcepts } from './linking';
import { tagBatch } from './tagging';

/** Untagged questions that start an analysis on their own. */
export const AUTO_ANALYZE_AT = 10;
/** The automatic pipeline looks for gaps at most this often; Analyze now always does. */
export const DIAGNOSE_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a newly recorded question starts a background analysis, and whether that
 * run may diagnose: a full batch starts one; so does a day since the last diagnosis
 * with anything waiting. Diagnoses come at most once a day, and after a failed run
 * nothing starts on its own for a day (Analyze now still works).
 */
export function autoAnalysis(
  untagged: number,
  state: { lastDiagnosedAt?: number; failedAt?: number },
  now: number,
): { run: boolean; diagnose: boolean } {
  const diagnose = now - (state.lastDiagnosedAt ?? 0) >= DIAGNOSE_EVERY_MS;
  const resting = state.failedAt !== undefined && now - state.failedAt < DIAGNOSE_EVERY_MS;
  return { run: !resting && (untagged >= AUTO_ANALYZE_AT || (untagged > 0 && diagnose)), diagnose };
}

/**
 * The learning-diagnosis pipeline: tag every waiting question with its concepts,
 * link the concepts to note cards, then (unless `withDiagnosis` is false) look for
 * gaps. `embeddingModel` empty: links by name only, no circling. Returns how many
 * new diagnoses it made.
 */
export async function analyze(repo: Repository, client: LlmClient, embeddingModel: string, now: number, withDiagnosis = true): Promise<number> {
  while (await tagBatch(repo, client));
  await linkConcepts(repo, client, embeddingModel);
  return withDiagnosis ? (await diagnose(repo, client, embeddingModel, now)).length : 0;
}
