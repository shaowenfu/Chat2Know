import type { LlmClient } from '@/src/llm/client';
import type { Repository } from '@/src/db/repository';
import { conceptKey } from '@/src/graph/prereq';
import { cosine, embedAll, nodeVectors } from './vectors';

/** Above this cosine similarity a concept name and a card are taken to be the same thing. */
export const LINK_THRESHOLD = 0.85;

/**
 * Links concepts of the prerequisite graph to the user's note cards: a card whose
 * title or term is the concept's name, or, with an embedding model, the most
 * similar card above the threshold. Concepts stay unlinked when nothing matches.
 */
export async function linkConcepts(repo: Repository, client: LlmClient, embeddingModel: string): Promise<void> {
  const unlinked = (await repo.listConcepts()).filter((c) => !c.nodeId);
  const cards = (await repo.listNodes()).filter((n) => (n.type === 'knowledge' || n.type === 'topic') && n.status !== 'draft');
  if (!unlinked.length || !cards.length) return;
  const links: { conceptId: string; nodeId: string }[] = [];
  const rest = unlinked.filter((c) => {
    const same = cards.find((n) => conceptKey(n.title) === conceptKey(c.name) || (n.term !== undefined && conceptKey(n.term) === conceptKey(c.name)));
    if (same) links.push({ conceptId: c.id, nodeId: same.id });
    return !same;
  });
  if (embeddingModel && rest.length) {
    const cardVectors = await nodeVectors(repo, client, embeddingModel, cards);
    const nameVectors = await embedAll(client, rest.map((c) => c.name));
    rest.forEach((c, i) => {
      const best = cards
        .map((n) => ({ id: n.id, score: cosine(nameVectors[i]!, cardVectors.get(n.id)!) }))
        .reduce((a, b) => (b.score > a.score ? b : a));
      if (best.score >= LINK_THRESHOLD) links.push({ conceptId: c.id, nodeId: best.id });
    });
  }
  await repo.linkConcepts(links);
}
