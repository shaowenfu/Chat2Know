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
