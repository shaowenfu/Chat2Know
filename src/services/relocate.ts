import type { Repository } from '@/src/db/repository';
import type { LlmClient } from '@/src/llm/client';
import { closestSections, sections, type Section } from './placement';

/** A place an item can move to: a section, by id, with its title path from the subject. */
export interface Place {
  id: string;
  path: string[];
}

export const PICKER_CANDIDATES = 3;
export const SEARCH_RESULTS = 6;

/** A place's path starts with its map's name. */
async function placer(repo: Repository, unnamed: string): Promise<(s: Section) => Place> {
  const names = new Map((await repo.listSubjects()).map((m) => [m.id, m.title || unnamed]));
  return (s) => ({ id: s.node.id, path: [names.get(s.node.subjectId)!, ...s.path] });
}

export interface PlaceLabels {
  unplaced: string;
  unnamed: string;
}

/** Titles from the map down to the item's parent; the 待归位 group and an unnamed map by their labels. */
export async function parentPath(repo: Repository, itemId: string, labels: PlaceLabels): Promise<string[]> {
  return (await repo.pathOf(itemId)).slice(0, -1).map((n) => (n.role ? labels.unplaced : n.title || labels.unnamed));
}

/**
 * Three other places in the item's map for the "改位置" picker: the closest topics by
 * vectors with an embedding model, else the topics recorded into most recently.
 */
export async function placeOptions(repo: Repository, client: Pick<LlmClient, 'embed'> | null, embeddingModel: string, itemId: string, unnamed: string): Promise<Place[]> {
  const item = await repo.node(itemId);
  const toPlace = await placer(repo, unnamed);
  const all = (await sections(repo, item.subjectId)).filter((s) => s.node.id !== item.parentId);
  if (client && embeddingModel) return (await closestSections(repo, client, embeddingModel, item, all)).slice(0, PICKER_CANDIDATES).map(toPlace);
  const byId = new Map(all.map((s) => [s.node.id, s]));
  const recent = (await repo.listItems()).sort((a, b) => b.createdAt - a.createdAt).map((i) => byId.get(i.parentId!));
  return [...new Set(recent.filter((s): s is Section => s !== undefined))].slice(0, PICKER_CANDIDATES).map(toPlace);
}

/** Sections of any map whose title contains the query, ignoring case: the user may move a note to another map. */
export async function searchPlaces(repo: Repository, query: string, unnamed: string): Promise<Place[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const toPlace = await placer(repo, unnamed);
  return (await sections(repo))
    .filter((s) => s.node.title.toLowerCase().includes(q))
    .slice(0, SEARCH_RESULTS)
    .map(toPlace);
}

/**
 * The user moves an item: an undoable write, and when the extension had placed it,
 * the new place becomes a placement example. `newTopic` creates a section of that
 * name under the chosen place (beside it when the place is already a topic).
 */
export async function moveByUser(repo: Repository, itemId: string, to: { placeId: string; newTopic?: string }, labels: PlaceLabels): Promise<{ group: string; path: string[] }> {
  let group: string;
  if (to.newTopic) {
    const near = await repo.pathOf(to.placeId);
    // A chapter (map › chapter) takes the new topic as its child; a topic gets a sibling.
    const parent = near.length >= 3 ? near.at(-2)! : near.at(-1)!;
    group = await repo.moveToNewSection(itemId, parent.id, to.newTopic);
  } else {
    group = await repo.move(itemId, to.placeId);
  }
  const path = await parentPath(repo, itemId, labels);
  await repo.notePlacementChange(itemId, path);
  return { group, path };
}
