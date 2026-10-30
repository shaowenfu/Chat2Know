import { LlmError, type LlmClient } from '@/src/llm/client';
import { parseGraphAddition, parseTags, prereqPrompt, tagPrompt } from '@/src/llm/prompts';
import type { Repository } from '@/src/db/repository';
import type { Concept } from '@/src/db/types';
import { conceptKey, hasCycle } from '@/src/graph/prereq';

/** Questions per tagging call. */
export const TAG_BATCH = 30;

/**
 * Tags one batch of untagged questions with the concepts they are about. A domain
 * seen for the first time gets its prerequisite graph generated (once); concepts
 * new to a known domain are added to its graph. Returns how many questions were tagged.
 */
export async function tagBatch(repo: Repository, client: LlmClient): Promise<number> {
  const asks = (await repo.untaggedAsks()).slice(0, TAG_BATCH);
  if (!asks.length) return 0;
  const domains = knownConcepts(await repo.listConcepts());
  const tags = await client.json(tagPrompt({ asks: asks.map((a) => a.text), known: [...domains.values()] }), (v) => parseTags(v, asks.length));

  const missing = new Map<string, { domain: string; names: Map<string, string> }>();
  for (const t of tags) {
    const known = new Set((domains.get(conceptKey(t.domain))?.names ?? []).map(conceptKey));
    for (const name of t.concepts.filter((n) => !known.has(conceptKey(n)))) {
      const m = missing.get(conceptKey(t.domain)) ?? { domain: t.domain, names: new Map() };
      m.names.set(conceptKey(name), name);
      missing.set(conceptKey(t.domain), m);
    }
  }
  for (const { domain, names } of missing.values()) await growGraph(repo, client, domain, [...names.values()]);

  const all = await repo.listConcepts();
  const idOf = (domain: string, name: string) =>
    all.find((c) => conceptKey(c.domain) === conceptKey(domain) && conceptKey(c.name) === conceptKey(name))!.id;
  await repo.saveTags(asks.map((a, i) => ({ askId: a.id, conceptIds: tags[i]!.concepts.map((n) => idOf(tags[i]!.domain, n)) })));
  return asks.length;
}

/** Concept names grouped by domain, as prompts list them. */
export function knownConcepts(concepts: Concept[]): Map<string, { domain: string; names: string[] }> {
  const domains = new Map<string, { domain: string; names: string[] }>();
  for (const c of concepts) {
    const d = domains.get(conceptKey(c.domain)) ?? { domain: c.domain, names: [] };
    d.names.push(c.name);
    domains.set(conceptKey(c.domain), d);
  }
  return domains;
}

/** Generates a new domain's graph, or extends a known one, so that it contains `required`. */
export async function growGraph(repo: Repository, client: LlmClient, domain: string, required: string[]): Promise<void> {
  const concepts = (await repo.listConcepts()).filter((c) => conceptKey(c.domain) === conceptKey(domain));
  const names = new Map(concepts.map((c) => [c.id, c.name]));
  const existingEdges = (await repo.listPrereqEdges()).filter((e) => names.has(e.to)).map((e) => ({ from: names.get(e.from)!, to: names.get(e.to)! }));
  const existing = concepts.map((c) => c.name);
  const addition = await client.json(prereqPrompt({ domain, existing, existingEdges, required }), (v) =>
    parseGraphAddition(v, existing, required, conceptKey),
  );
  const merged = [...existingEdges, ...addition.edges].map((e) => ({ from: conceptKey(e.from), to: conceptKey(e.to) }));
  if (hasCycle(merged)) throw new LlmError(`The prerequisite graph for "${domain}" has a cycle`);
  await repo.addToGraph(domain, addition.concepts, addition.edges);
}
