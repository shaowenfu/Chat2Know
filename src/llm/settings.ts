import { browser } from 'wxt/browser';
import type { ModelSettings } from './client';

// Background only: this is the one place the API key is read.
const KEY = 'modelSettings';

export const EMPTY_SETTINGS: ModelSettings = { baseUrl: '', model: '', apiKey: '', embeddingModel: '' };

export async function loadSettings(): Promise<ModelSettings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<ModelSettings> | undefined;
  return { ...EMPTY_SETTINGS, ...stored };
}

export async function saveSettings(settings: ModelSettings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

/** What the side panel may see: everything except the key itself. */
export interface PublicSettings {
  baseUrl: string;
  model: string;
  embeddingModel: string;
  hasKey: boolean;
}

export function toPublic(s: ModelSettings): PublicSettings {
  return { baseUrl: s.baseUrl, model: s.model, embeddingModel: s.embeddingModel, hasKey: s.apiKey.length > 0 };
}

export const isConfigured = (s: ModelSettings) => Boolean(s.baseUrl && s.model && s.apiKey);
