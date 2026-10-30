import { browser } from 'wxt/browser';

const KEY = 'recording';

/** Which sites record the user's sent questions. Off until the user ticks a site. */
export interface RecordingSettings {
  /** Origins the recorder runs on, e.g. "https://chatgpt.com". */
  origins: string[];
  paused: boolean;
  /** Conversation URLs (without hash) the user excluded. */
  excluded: string[];
}

const EMPTY: RecordingSettings = { origins: [], paused: false, excluded: [] };

export async function loadRecording(): Promise<RecordingSettings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<RecordingSettings> | undefined;
  return { ...EMPTY, ...stored };
}

export async function saveRecording(settings: RecordingSettings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

export const isRecording = (s: RecordingSettings) => s.origins.length > 0 && !s.paused;

/** Whether a question sent from this page is stored. The background is the only gate. */
export function shouldRecord(s: RecordingSettings, url: string): boolean {
  const u = new URL(url);
  return isRecording(s) && s.origins.includes(u.origin) && !s.excluded.includes(u.href.replace(/#.*$/, ''));
}

const ANALYSIS_KEY = 'analysis';

/** Outcome of the last background analysis, shown in the Learning tab. */
export interface AnalysisState {
  lastError?: string;
  lastDiagnosedAt?: number;
  /** When the last run failed; automatic runs wait a day after a failure. */
  failedAt?: number;
}

export async function loadAnalysis(): Promise<AnalysisState> {
  return ((await browser.storage.local.get(ANALYSIS_KEY))[ANALYSIS_KEY] as AnalysisState | undefined) ?? {};
}

export async function saveAnalysis(state: AnalysisState): Promise<void> {
  await browser.storage.local.set({ [ANALYSIS_KEY]: state });
}
