import type { LlmClient } from '@/src/llm/client';
import { organizePrompt, parseCandidates, type CandidateCard } from '@/src/llm/prompts';

/** One request per organize pass; longer text should be selected or pasted in parts. */
export const MAX_ORGANIZE_CHARS = 100_000;

export async function organize(client: LlmClient, text: string): Promise<CandidateCard[]> {
  const body = text.trim();
  if (!body) throw new Error('Nothing to organize');
  if (body.length > MAX_ORGANIZE_CHARS) {
    throw new Error(`Text is too long to organize at once (${body.length} characters, limit ${MAX_ORGANIZE_CHARS}). Paste a part instead.`);
  }
  return client.json(organizePrompt(body), parseCandidates);
}
