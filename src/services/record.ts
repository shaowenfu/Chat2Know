import type { Repository } from '@/src/db/repository';
import type { ItemSource, ItemType, MapNode } from '@/src/db/types';
import { normalizeLatex, normalizeStatement } from '@/src/graph/latex';

export interface RecordRequest {
  itemType: ItemType;
  title: string;
  latex?: string;
  source: ItemSource;
  /** "仍然添加": record even though the same item is already on the map. */
  force?: boolean;
}

export type RecordResult =
  | { status: 'recorded'; group: string; itemId: string; path: string[] }
  | { status: 'duplicate'; itemId: string; path: string[] };

export interface RecordLabels {
  unplaced: string;
  newSubject: string;
}

const stripHash = (url: string) => url.replace(/#.*$/, '');

const sameItem = (a: MapNode, r: RecordRequest) =>
  a.itemType === r.itemType &&
  (r.itemType === 'formula' ? normalizeLatex(a.latex ?? '') === normalizeLatex(r.latex ?? '') : normalizeStatement(a.title) === normalizeStatement(r.title));

/** Titles from the subject down to the item's parent, as the toast shows them. */
export async function placePath(repo: Repository, nodeId: string, labels: RecordLabels): Promise<string[]> {
  const path = await repo.pathOf(nodeId);
  return path.filter((n) => n.kind !== 'item').map((n) => (n.role === 'unplaced' ? labels.unplaced : n.title));
}

/**
 * Stores a recorded item at once, without any model: where the previous item of
 * this conversation went, else in the "待归位" group of the subject last recorded
 * into (a new subject when there is none). The same formula or statement already
 * on the map is not added again unless forced.
 */
export async function recordItem(repo: Repository, req: RecordRequest, labels: RecordLabels): Promise<RecordResult> {
  const items = await repo.listItems();
  const duplicate = req.force ? undefined : items.find((i) => sameItem(i, req));
  if (duplicate) return { status: 'duplicate', itemId: duplicate.id, path: await placePath(repo, duplicate.id, labels) };

  const newestFirst = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const conversation = stripHash(req.source.url);
  const previous = newestFirst.find((i) => i.source && stripHash(i.source.url) === conversation);
  const input = { itemType: req.itemType, title: req.title, ...(req.latex === undefined ? {} : { latex: req.latex }), source: req.source };
  let written;
  if (previous) {
    written = await repo.addItem({ parentId: previous.parentId! }, input);
  } else {
    const subjectId = newestFirst[0]?.subjectId ?? (await repo.listSubjects()).at(-1)?.id;
    written = await repo.addItem(subjectId ? { unplacedIn: subjectId } : { newSubject: labels.newSubject }, input);
  }
  return { status: 'recorded', group: written.group, itemId: written.node.id, path: await placePath(repo, written.node.id, labels) };
}
