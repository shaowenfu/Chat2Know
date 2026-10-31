import { browser } from 'wxt/browser';
import { SITES } from '@/src/capture/sites';
import { sendMessage } from '@/src/messaging';

/** The AI sites offered as ticks: their main origin. Other sites can be added later from settings. */
export const SITE_CHOICES = SITES.map((s) => ({ id: s.id, name: s.name, origin: `https://${s.hosts[0]}` }));

/** Ticks a site: the browser asks for access to exactly that site first. */
export async function tickSite(origins: string[], origin: string, on: boolean): Promise<string[]> {
  if (on && !(await browser.permissions.request({ origins: [`${origin}/*`] }))) return origins;
  const next = on ? [...origins, origin] : origins.filter((o) => o !== origin);
  const saved = await sendMessage('sites/setOrigins', { origins: next });
  if (!on) await browser.permissions.remove({ origins: [`${origin}/*`] });
  return saved.origins;
}
