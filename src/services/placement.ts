import type { Repository } from '@/src/db/repository';
import type { MapNode } from '@/src/db/types';
import type { MapTree } from '@/src/graph/tree';
import { cosine } from '@/src/graph/cosine';
import type { LlmClient } from '@/src/llm/client';
import { parsePlacement, placePrompt } from '@/src/llm/prompts';
import { embedAll } from './vectors';

export const CANDIDATES = 8;
export const EXAMPLES = 20;
/** Items of a topic that go into its vector text. */
const ITEMS_PER_TOPIC = 5;

const SEP = ' › ';

export interface PlaceRequest {
  itemId: string;
  /** The record's undo group: placement joins it, so the toast's 撤销 takes both back. None: a write of its own. */
  group?: string;
  before: string;
  after: string;
  untitled: string;
  unplaced: string;
}

type Client = Pick<LlmClient, 'json' | 'embed'>;

const itemText = (n: MapNode) => n.latex ?? n.title;

export interface Section {
  node: MapNode;
  path: string[]; // titles from the subject down to this section
  items: string[]; // the texts of the items right below it
}

/** Every section of every subject with its title path; the 待归位 groups are no place. */
export async function sections(repo: Repository): Promise<Section[]> {
  const out: Section[] = [];
  const walk = (t: MapTree, path: string[]) => {
    for (const c of t.children) {
      if (c.node.kind !== 'section' || c.node.role) continue;
      const p = [...path, c.node.title];
      out.push({ node: c.node, path: p, items: c.children.filter((x) => x.node.kind === 'item').map((x) => itemText(x.node)) });
      walk(c, p);
    }
  };
  for (const s of await repo.listSubjects()) walk(await repo.subjectTree(s.id), [s.title]);
  return out;
}

function outline(trees: MapTree[]): string {
  const lines: string[] = [];
  const walk = (t: MapTree, depth: number) => {
    if (t.node.kind === 'item' || t.node.role) return;
    lines.push(`${'  '.repeat(depth)}${t.node.title}`);
    t.children.forEach((c) => walk(c, depth + 1));
  };
  trees.forEach((t) => walk(t, 0));
  return lines.join('\n');
}

/** The topics closest to the item by vectors, closest first; topic vectors are cached until their text changes. */
export async function closestSections(repo: Repository, client: Pick<LlmClient, 'embed'>, model: string, item: MapNode, all: Section[]): Promise<Section[]> {
  if (!all.length) return [];
  const texts = all.map((s) => [s.path.join(SEP), ...s.items.slice(0, ITEMS_PER_TOPIC)].join('\n'));
  const cached = await repo.embeddings(all.map((s) => s.node.id));
  const stale = all.map((s, i) => i).filter((i) => {
    const e = cached.get(all[i]!.node.id);
    return !e || e.model !== model || e.text !== texts[i];
  });
  const [itemVector, ...fresh] = await embedAll(client, [itemText(item), ...stale.map((i) => texts[i]!)]);
  const rows = stale.map((i, k) => ({ nodeId: all[i]!.node.id, model, text: texts[i]!, vector: fresh[k]! }));
  await repo.putEmbeddings(rows);
  for (const r of rows) cached.set(r.nodeId, r);
  return all
    .map((s) => ({ s, score: cosine(itemVector!, cached.get(s.node.id)!.vector) }))
    .sort((a, b) => b.score - a.score)
    .map((c) => c.s);
}

/** Places every item waiting in a 待归位 group, one model call each (after the model is set up, or an import). */
export async function placeUnplaced(repo: Repository, client: Client, embeddingModel: string, labels: { untitled: string; unplaced: string }): Promise<number> {
  let placed = 0;
  for (const item of await repo.listItems()) {
    const parent = await repo.node(item.parentId!);
    if (parent.role !== 'unplaced') continue;
    const path = await placeItem(repo, client, embeddingModel, { itemId: item.id, before: item.source?.quotePrefix ?? '', after: item.source?.quoteSuffix ?? '', ...labels });
    if (path) placed++;
  }
  return placed;
}

/**
 * Moves a just-recorded item to where it belongs: one model call picks the subject
 * and the topic (or a new one) and compresses a statement to one sentence. Returns
 * the new path's titles, or null when the item changed meanwhile (undone, moved or
 * edited by the user), which is left as it is.
 */
export async function placeItem(repo: Repository, client: Client, embeddingModel: string, req: PlaceRequest): Promise<string[] | null> {
  const item = await repo.find(req.itemId);
  if (!item || item.deletedAt) return null;
  const now = await repo.pathOf(item.id);
  const reply = await client.json(
    placePrompt({
      itemType: item.itemType!,
      text: itemText(item),
      before: req.before,
      after: req.after,
      now: now.slice(0, -1).map((n) => (n.role ? req.unplaced : n.title)).join(SEP),
      candidates: embeddingModel ? (await closestSections(repo, client, embeddingModel, item, await sections(repo))).slice(0, CANDIDATES).map((c) => c.path.join(SEP)) : [],
      subjects: outline(await Promise.all((await repo.listSubjects()).map((s) => repo.subjectTree(s.id)))),
      examples: await repo.placementExamples(EXAMPLES),
    }),
    (v) => parsePlacement(v, item.itemType!),
  );
  const path = await repo.fileItem(item.id, item.updatedAt, { subject: reply.subject, path: reply.path, statement: reply.statement, untitled: req.untitled }, req.group);
  if (!path) return null;
  const titles = path.slice(0, -1).map((n) => n.title);
  await repo.notePlacement(item.id, titles);
  return titles;
}

