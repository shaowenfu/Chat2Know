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

/** Opens the fixture page and the side panel page, with the toolbar injected into the fixture. */
export async function openPageAndPanel(
  context: import('@playwright/test').BrowserContext,
  extensionId: string,
  url: string,
): Promise<{ page: Page; panel: Page }> {
  const page = await context.newPage();
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const res = await send(panel, 'page/activate', { tabId: await tabIdOf(panel, url) });
  if (!res.ok) throw new Error(res.error);
  return { page, panel };
}

/** Saves an ask-later question about `term` (first occurrence inside `selector`). */
export async function askLater(page: Page, selector: string, term: string, question = ''): Promise<void> {
  await selectText(page, selector, term);
  await page.getByRole('button', { name: /^(Ask later|稍后问)$/ }).click();
  if (question) await page.getByRole('textbox').fill(question);
  await page.keyboard.press('Enter');
  await page.getByRole('status').waitFor();
}
