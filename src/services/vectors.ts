import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import type { Ask, KNode } from '@/src/db/types';

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

const textOf = (n: KNode) => [n.title, n.summary].filter(Boolean).join('\n');

/** Returns vectors for the nodes, embedding only those whose cached text or model is stale. */
export async function nodeVectors(repo: Repository, client: LlmClient, model: string, nodes: KNode[]): Promise<Map<string, number[]>> {
  const cached = await repo.embeddingsFor(nodes.map((n) => n.id));
  const stale = nodes.filter((n) => {
    const e = cached.get(n.id);
    return !e || e.model !== model || e.text !== textOf(n);
  });
  for (let i = 0; i < stale.length; i += EMBED_BATCH) {
    const batch = stale.slice(i, i + EMBED_BATCH);
    const fresh = await client.embed(batch.map(textOf));
    const rows = batch.map((n, j) => ({ nodeId: n.id, model, text: textOf(n), vector: fresh[j]! }));
    await repo.putEmbeddings(rows); // cached per batch, so a later failure does not redo earlier work
    for (const r of rows) cached.set(r.nodeId, r);
  }
  return new Map([...cached].map(([id, e]) => [id, e.vector]));
}
