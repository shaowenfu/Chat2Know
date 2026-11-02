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
  | { status: 'duplicate'; itemId: string; path: string[] }
  /** No map is open: nothing was stored; the user creates or opens one. */
  | { status: 'noMap' };

export interface RecordLabels {
  unplaced: string;
  unnamed: string;
}

const stripHash = (url: string) => url.replace(/#.*$/, '');

/** The same formula (normalized LaTeX), statement (normalized text) or quote (the exact words). */
export const sameItem = (a: Pick<MapNode, 'itemType' | 'title' | 'latex'>, r: Pick<RecordRequest, 'itemType' | 'title' | 'latex'>) =>
  a.itemType === r.itemType &&
  (r.itemType === 'formula'
    ? normalizeLatex(a.latex ?? '') === normalizeLatex(r.latex ?? '')
    : r.itemType === 'quote'
      ? a.title === r.title
      : normalizeStatement(a.title) === normalizeStatement(r.title));

/** Titles from the subject down to the item's parent, as the toast shows them. */
export async function placePath(repo: Repository, nodeId: string, labels: RecordLabels): Promise<string[]> {
  const path = await repo.pathOf(nodeId);
  return path.filter((n) => n.kind !== 'item').map((n) => (n.role === 'unplaced' ? labels.unplaced : n.title || labels.unnamed));
}

/**
 * Stores a recorded item at once, without any model, in the map the user opened:
 * where the previous item of this conversation went in that map, else in its
 * "待归位" group. The same formula or statement already in that map is not added
 * again unless forced. With no map open nothing is stored.
 */
export async function recordItem(repo: Repository, mapId: string | undefined, req: RecordRequest, labels: RecordLabels): Promise<RecordResult> {
  const map = mapId === undefined ? undefined : await repo.find(mapId);
  if (!map || map.deletedAt || map.kind !== 'subject') return { status: 'noMap' };
  const items = (await repo.listItems()).filter((i) => i.subjectId === map.id);
  const duplicate = req.force ? undefined : items.find((i) => sameItem(i, req));
  // Recording what the extension had added makes it the user's own (solid black).
  if (duplicate?.origin === 'plugin') {
    const { group } = await repo.adopt(duplicate.id, req.source);
    return { status: 'recorded', group, itemId: duplicate.id, path: await placePath(repo, duplicate.id, labels) };
  }
  if (duplicate) return { status: 'duplicate', itemId: duplicate.id, path: await placePath(repo, duplicate.id, labels) };

  const conversation = stripHash(req.source.url);
  const previous = [...items].sort((a, b) => b.createdAt - a.createdAt).find((i) => i.source && stripHash(i.source.url) === conversation);
  const input = { itemType: req.itemType, title: req.title, ...(req.latex === undefined ? {} : { latex: req.latex }), source: req.source };
  const written = await repo.addItem(previous ? { parentId: previous.parentId! } : { unplacedIn: map.id }, input);
  return { status: 'recorded', group: written.group, itemId: written.node.id, path: await placePath(repo, written.node.id, labels) };
}
