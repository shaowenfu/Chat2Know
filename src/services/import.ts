import type { ItemInput, Repository } from '@/src/db/repository';
import { sameItem } from './record';

/**
 * v0.1 notes join a new subject's 待归位 group, leaving out any already on the map
 * or repeated within the import (importing twice adds nothing). Returns how many joined.
 */
export async function importV01(repo: Repository, items: ItemInput[], subjectTitle: string): Promise<number> {
  const existing = await repo.listItems();
  const fresh: ItemInput[] = [];
  for (const i of items) {
    if (existing.some((e) => sameItem(e, i)) || fresh.some((f) => sameItem(f, i))) continue;
    fresh.push(i);
  }
  if (fresh.length) await repo.importItems(subjectTitle, fresh);
  return fresh.length;
}
