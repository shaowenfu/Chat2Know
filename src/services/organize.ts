import { UserError } from '@/src/errors';
import type { LlmClient } from '@/src/llm/client';
import { organizePrompt, parseCandidates, type CandidateCard } from '@/src/llm/prompts';

/** One request per organize pass; longer text should be selected or pasted in parts. */
export const MAX_ORGANIZE_CHARS = 100_000;

export async function organize(client: LlmClient, text: string): Promise<CandidateCard[]> {
  const body = text.trim();
  if (!body) throw new UserError('error.nothingToOrganize');
  if (body.length > MAX_ORGANIZE_CHARS) throw new UserError('error.tooLong', [String(body.length), String(MAX_ORGANIZE_CHARS)]);
  return client.json(organizePrompt(body), parseCandidates);
}
