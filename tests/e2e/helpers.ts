/// <reference types="chrome" />
import type { Page } from '@playwright/test';

/** Sends a protocol message from an extension page and returns the raw Result envelope. */
export function send<T = unknown>(panel: Page, type: string, payload: unknown): Promise<{ ok: boolean; data: T; error?: string }> {
  return panel.evaluate(([t, p]) => chrome.runtime.sendMessage({ type: t, payload: p }), [type, payload] as const);
}

export async function tabIdOf(panel: Page, url: string): Promise<number> {
  return panel.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]!.id!, url);
}

/** Selects from the start of `fromSelector` to the end of `toSelector`, like a user drag. */
export async function selectBetween(page: Page, fromSelector: string, toSelector: string): Promise<void> {
  await page.evaluate(
    ([from, to]) => {
      const range = document.createRange();
      range.setStartBefore(document.querySelector(from)!);
      range.setEndAfter(document.querySelector(to)!);
      const sel = document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    [fromSelector, toSelector] as const,
  );
}

/** Selects the first occurrence of `text` inside `selector` and releases the mouse, like a user. */
export async function selectText(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate(
    ([sel, needle]) => {
      const root = document.querySelector(sel)!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent!.indexOf(needle);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + needle.length);
        const s = document.getSelection()!;
        s.removeAllRanges();
        s.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
      throw new Error(`Text not found: ${needle}`);
    },
    [selector, text] as const,
  );
}

export function configureModel(panel: Page, baseUrl: string, apiKey = 'test-key') {
  return send(panel, 'settings/save', { baseUrl, model: 'mock-model', embeddingModel: 'mock-embed', apiKey });
}
