import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import { cosine, nodeVectors } from './vectors';

/** Above this cosine similarity two cards are treated as the same concept and a merge is offered. */
export const DUPLICATE_THRESHOLD = 0.9;
export const MAX_PARENTS = 3;

export interface Candidate {
  id: string;
  title: string;
  score: number;
}

export interface Placement {
  parents: Candidate[];
  duplicate?: Candidate;
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
  const vecs = await nodeVectors(repo, client, model, [node, ...others]);
  const own = vecs.get(nodeId)!;
  const ranked = others
    .map((n) => ({ id: n.id, title: n.title, score: cosine(own, vecs.get(n.id)!) }))
    .sort((a, b) => b.score - a.score);
  const [top] = ranked;
  if (top && top.score >= DUPLICATE_THRESHOLD) return { parents: ranked.slice(1, MAX_PARENTS + 1), duplicate: top };
  return { parents: ranked.slice(0, MAX_PARENTS) };
}
