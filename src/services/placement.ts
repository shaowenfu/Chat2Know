import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import type { KNode } from '@/src/db/types';

/** Above this cosine similarity two cards are treated as the same concept and a merge is offered. */
export const DUPLICATE_THRESHOLD = 0.9;
export const MAX_PARENTS = 3;
/** Inputs per /embeddings request; providers cap it (OpenAI: 2048) and cap tokens per request. */
export const EMBED_BATCH = 128;

export interface Candidate {
  id: string;
  title: string;
  score: number;
}

export interface Placement {
  parents: Candidate[];
  duplicate?: Candidate;
}

const textOf = (n: KNode) => [n.title, n.summary].filter(Boolean).join('\n');

function cosine(a: number[], b: number[]): number {
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

/** Returns vectors for the nodes, embedding only those whose cached text or model is stale. */
async function vectors(repo: Repository, client: LlmClient, model: string, nodes: KNode[]): Promise<Map<string, number[]>> {
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

/**
 * Where should this card go? The most similar existing cards (excluding itself
 * and its descendants) are offered as parents; a near-identical one is offered
 * as a merge target instead.
 */
export async function suggestPlacement(repo: Repository, client: LlmClient, model: string, nodeId: string): Promise<Placement> {
  const all = await repo.listNodes();
  const node = all.find((n) => n.id === nodeId);
  if (!node) throw new Error('Card not found');
  // Placement is for top-level cards; a card with a parent (e.g. a follow-up) keeps its relation.
  if (node.parent) return { parents: [] };
  const below = await repo.descendantsOf(nodeId);
  const others = all.filter(
    (n) => n.id !== nodeId && !below.has(n.id) && (n.type === 'knowledge' || n.type === 'topic') && n.status !== 'draft',
  );
  if (others.length === 0) return { parents: [] };
  const vecs = await vectors(repo, client, model, [node, ...others]);
  const own = vecs.get(nodeId)!;
  const ranked = others
    .map((n) => ({ id: n.id, title: n.title, score: cosine(own, vecs.get(n.id)!) }))
    .sort((a, b) => b.score - a.score);
  const [top] = ranked;
  if (top && top.score >= DUPLICATE_THRESHOLD) return { parents: ranked.slice(1, MAX_PARENTS + 1), duplicate: top };
  return { parents: ranked.slice(0, MAX_PARENTS) };
}
