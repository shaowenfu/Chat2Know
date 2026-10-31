import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import type { Ask } from '@/src/db/types';

/** Inputs per /embeddings request; providers cap it (OpenAI: 2048) and cap tokens per request. */
export const EMBED_BATCH = 128;

/** Embeds texts in provider-sized batches. */
export async function embedAll(client: LlmClient, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) out.push(...(await client.embed(texts.slice(i, i + EMBED_BATCH))));
  return out;
}

/** Embeds the questions that have no vector for this model yet, and stores the vectors on them. */
export async function embedAsks(repo: Repository, client: LlmClient, model: string, asks: Ask[]): Promise<void> {
  const missing = asks.filter((a) => a.vectorModel !== model);
  if (!missing.length) return;
  const vectors = await embedAll(client, missing.map((a) => a.text));
  await repo.setAskVectors(missing.map((a, i) => ({ id: a.id, vector: vectors[i]!, vectorModel: model })));
}
