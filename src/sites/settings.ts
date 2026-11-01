import { browser } from 'wxt/browser';

export const SITES_KEY = 'sites';

/** The AI sites the user ticked: the site script (＋ beside formulas) runs there, and records questions if asked to. */
export interface SiteSettings {
  /** Origins the site script runs on, e.g. "https://chatgpt.com". */
  origins: string[];
  /** "Also record the questions I send on these sites." Off by default. */
  recordAsks: boolean;
  /** Conversation URLs (without hash) the user excluded from recording. */
  excluded: string[];
}

const EMPTY: SiteSettings = { origins: [], recordAsks: false, excluded: [] };

export async function loadSites(): Promise<SiteSettings> {
  const stored = (await browser.storage.local.get(SITES_KEY))[SITES_KEY] as Partial<SiteSettings> | undefined;
  return { ...EMPTY, ...stored };
}

export async function saveSites(settings: SiteSettings): Promise<void> {
  await browser.storage.local.set({ [SITES_KEY]: settings });
}

export const isRecording = (s: SiteSettings) => s.origins.length > 0 && s.recordAsks;

/** Whether a question sent from this page is stored. The background is the only gate. */
export function shouldRecord(s: SiteSettings, url: string): boolean {
  const u = new URL(url);
  return isRecording(s) && s.origins.includes(u.origin) && !s.excluded.includes(u.href.replace(/#.*$/, ''));
}

/** 0.1 kept its ticked sites under `recording` (for its question recorder) and analysis state under `analysis`. */
const V01_KEYS = { recording: 'recording', analysis: 'analysis' };

/**
 * After an update from 0.1: its ticked sites become the site script's sites, with
 * question recording on unless it was paused there; 0.1's keys go. Does nothing otherwise.
 */
export async function migrateV01Sites(): Promise<void> {
  const stored = await browser.storage.local.get([V01_KEYS.recording, SITES_KEY]);
  const old = stored[V01_KEYS.recording] as { origins?: string[]; paused?: boolean; excluded?: string[] } | undefined;
  if (!old) return;
  if (!stored[SITES_KEY]) await saveSites({ origins: old.origins ?? [], recordAsks: (old.origins ?? []).length > 0 && !old.paused, excluded: old.excluded ?? [] });
  await browser.storage.local.remove([V01_KEYS.recording, V01_KEYS.analysis]);
}
