import { browser } from 'wxt/browser';
import type { OutlineNode } from '@/src/graph/tree';

const KEY = 'outlines';

/** Per subject: the outline offered (cached so the model is asked once), and whether the user laid it or said no. */
export interface OutlineDecision {
  status: 'proposed' | 'laid' | 'declined';
  outline?: OutlineNode[];
  /** The map's name the proposal was made for: a renamed map gets a new one. */
  forTitle?: string;
}

export async function loadOutlines(): Promise<Record<string, OutlineDecision>> {
  return ((await browser.storage.local.get(KEY))[KEY] as Record<string, OutlineDecision> | undefined) ?? {};
}

export async function saveOutline(subjectId: string, decision: OutlineDecision): Promise<void> {
  await browser.storage.local.set({ [KEY]: { ...(await loadOutlines()), [subjectId]: decision } });
}
