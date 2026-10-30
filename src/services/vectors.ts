import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import type { KNode } from '@/src/db/types';

/** Inputs per /embeddings request; providers cap it (OpenAI: 2048) and cap tokens per request. */
export const EMBED_BATCH = 128;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Embeds texts in provider-sized batches. */
export async function embedAll(client: LlmClient, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) out.push(...(await client.embed(texts.slice(i, i + EMBED_BATCH))));
  return out;
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
