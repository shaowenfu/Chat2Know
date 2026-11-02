import { browser } from 'wxt/browser';

export const OPEN_MAP_KEY = 'openMap';

/** The map the user opened: everything recorded goes into it. Only the user sets it. */
export async function loadOpenMap(): Promise<string | undefined> {
  const id = (await browser.storage.local.get(OPEN_MAP_KEY))[OPEN_MAP_KEY];
  return typeof id === 'string' ? id : undefined;
}

export async function saveOpenMap(id: string | null): Promise<void> {
  if (id === null) await browser.storage.local.remove(OPEN_MAP_KEY);
  else await browser.storage.local.set({ [OPEN_MAP_KEY]: id });
}
