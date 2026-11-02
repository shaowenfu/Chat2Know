import { browser } from 'wxt/browser';
import en from '@/locales/en.json';
import zhCN from '@/locales/zh_CN.json';

/**
 * The extension's language: the browser's, or the one the user picked in the first
 * screen or settings. Chrome's own i18n cannot switch at runtime, so the locale files
 * are bundled and looked up here; the manifest's strings still come from `_locales`.
 */

export type UiLang = 'auto' | 'zh_CN' | 'en';
export type Lang = Exclude<UiLang, 'auto'>;

export const UI_LANG_KEY = 'uiLang';

type Messages = { [key: string]: string | Messages };
const MESSAGES: Record<Lang, Messages> = { en, zh_CN: zhCN };

const browserLang = (): Lang => (browser.i18n.getUILanguage().toLowerCase().startsWith('zh') ? 'zh_CN' : 'en');

/** Undefined until first needed: module code also runs at build time, outside a browser. */
let chosen: Lang | undefined;

const resolve = (choice: UiLang | undefined): Lang => (choice === 'zh_CN' || choice === 'en' ? choice : browserLang());

export async function loadUiLang(): Promise<UiLang> {
  const v = (await browser.storage.local.get(UI_LANG_KEY))[UI_LANG_KEY];
  return v === 'zh_CN' || v === 'en' ? v : 'auto';
}

export async function saveUiLang(choice: UiLang): Promise<void> {
  if (choice === 'auto') await browser.storage.local.remove(UI_LANG_KEY);
  else await browser.storage.local.set({ [UI_LANG_KEY]: choice });
}

/** Reads the user's choice and follows its changes; `onChange` runs after a change (pages reload). */
export async function initI18n(onChange?: () => void): Promise<void> {
  chosen = resolve(await loadUiLang());
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(UI_LANG_KEY in changes)) return;
    chosen = resolve(changes[UI_LANG_KEY]!.newValue as UiLang | undefined);
    onChange?.();
  });
}

export const currentLang = (): Lang => (chosen ??= browserLang());

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

function translate(key: string, subs: string[] = []): string {
  const text = lookup(MESSAGES[currentLang()], key);
  if (text === undefined) throw new Error(`Missing message ${key} (${currentLang()})`);
  return text.replace(/\$(\d)/g, (m, n: string) => subs[Number(n) - 1] ?? m);
}

/** Same call shape and key checking as WXT's generated `i18n.t`. */
export const i18n = { t: translate as unknown as (typeof import('#i18n'))['i18n']['t'] };
