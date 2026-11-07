import type { LlmClient } from '@/src/llm/client';

/** Inputs per /embeddings request; providers cap it (OpenAI: 2048) and cap tokens per request. */
export const EMBED_BATCH = 128;

/** Embeds texts in provider-sized batches. */
export async function embedAll(client: Pick<LlmClient, 'embed'>, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) out.push(...(await client.embed(texts.slice(i, i + EMBED_BATCH))));
  return out;
}
