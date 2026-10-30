import type { LlmClient } from '@/src/llm/client';
import { circlingPrompt, parseCircling } from '@/src/llm/prompts';
import type { Repository } from '@/src/db/repository';
import type { Diagnosis } from '@/src/db/types';
import { conceptKey } from '@/src/graph/prereq';
import { rankRootCauses, type WeightedSymptom } from '@/src/graph/rootcause';
import { WINDOW_DAYS, detectSignals } from '@/src/graph/signals';
import { growGraph, knownConcepts } from './tagging';
import { embedAsks } from './vectors';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A dismissed root concept is not diagnosed again for this long. */
export const COOLDOWN_DAYS = 30;
/** Suspected diagnoses open at once; more would nag. */
export const MAX_OPEN = 3;

/**
 * Turns the learner's recent questions into new suspected diagnoses: signals per
 * concept, the concept behind each circling run (one model call per run), then
 * the best-explaining root concepts. Skips roots already open or dismissed in the
 * last 30 days, evidence already explained, and never reuses the evidence of a
 * dismissed diagnosis. Circling needs `embeddingModel`.
 */
export async function diagnose(repo: Repository, client: LlmClient, embeddingModel: string, now: number): Promise<Diagnosis[]> {
  const existing = await repo.listDiagnoses();
  const suspected = existing.filter((d) => d.status === 'suspected').length;
  if (suspected >= MAX_OPEN) return [];
  if (embeddingModel) await embedAsks(repo, client, embeddingModel, (await repo.listAsks()).filter((a) => a.sentAt >= now - WINDOW_DAYS * DAY_MS));

  const spent = new Set(existing.filter((d) => d.status === 'dismissed').flatMap((d) => d.evidenceAskIds));
  const asks = (await repo.listAsks())
    .filter((a) => !spent.has(a.id))
    .map((a) => ({ ...a, vector: a.vectorModel === embeddingModel ? a.vector : undefined }));
  const text = new Map(asks.map((a) => [a.id, a.text]));
  const open = existing.filter((d) => d.status !== 'dismissed');
  const covered = new Set(open.flatMap((d) => d.evidenceAskIds));

  let concepts = await repo.listConcepts();
  const { symptoms, circling } = detectSignals({
    asks,
    tags: await repo.listAskTags(),
    conceptIds: concepts.map((c) => c.id),
    edges: await repo.listPrereqEdges(),
    now,
  });
  const weighted: WeightedSymptom[] = [...symptoms];
  for (const run of circling.filter((r) => !r.askIds.every((id) => covered.has(id)))) {
    const root = await client.json(circlingPrompt({ asks: run.askIds.map((id) => text.get(id)!), known: [...knownConcepts(concepts).values()] }), parseCircling);
    if (!root) continue;
    const find = () => concepts.find((c) => conceptKey(c.domain) === conceptKey(root.domain) && conceptKey(c.name) === conceptKey(root.concept));
    if (!find()) {
      await growGraph(repo, client, root.domain, [root.concept]);
      concepts = await repo.listConcepts();
    }
    weighted.push({ conceptId: find()!.id, signals: {}, askIds: run.askIds, circling: run.askIds.length });
  }

  const ranked = rankRootCauses(weighted, concepts.map((c) => c.id), await repo.listPrereqEdges());
  const cooling = existing.filter((d) => d.status === 'dismissed' && now - (d.decidedAt ?? d.createdAt) < COOLDOWN_DAYS * DAY_MS);
  const blocked = new Set([...open, ...cooling].map((d) => d.rootConceptId));
  // A broader concept explaining nothing beyond a blocked root is the same hypothesis again.
  const blockedExplains = new Set(ranked.filter((c) => blocked.has(c.conceptId)).flatMap((c) => c.explains));
  const chosen = [];
  for (const c of ranked) {
    if (suspected + chosen.length >= MAX_OPEN) break;
    if (blocked.has(c.conceptId) || c.explains.every((id) => blockedExplains.has(id)) || c.askIds.every((id) => covered.has(id))) continue;
    chosen.push(c);
    c.askIds.forEach((id) => covered.add(id));
  }
  return repo.addDiagnoses(chosen.map((c) => ({ rootConceptId: c.conceptId, signals: c.signals, evidenceAskIds: c.askIds })));
}
