/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { selectText, send, tabIdOf } from './helpers';

const SITE_PAGES: Record<string, number> = {
  'chatgpt-zh-softmax.html': 38,
  'claude-zh-ai-math.html': 9,
  'deepseek-zh-matrix.html': 7,
  'gemini-zh-logarithm.html': 1,
  'kimi-zh-softmax.html': 4,
  'doubao-zh-softmax.html': 0, // its answer has inline formulas only
};

test('＋ beside formulas on ticked sites: record, toast, undo, duplicates; nothing on other sites', async ({ context, extensionId, fixtureServer, serviceWorker }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const markdown = async () => (await send<string>(panel, 'map/export', { format: 'markdown' })).data;

  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(`${fixtureServer}/synthetic-chat-katex.html`);
  expect(await page.locator('chat2know-ui').count()).toBe(0);
  await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });

  // The open tab gets the script at once: one ＋ per display formula.
  const plus = page.locator('chat2know-ui button[data-state="add"]');
  await expect(plus).toHaveCount(1);
  await plus.first().click();
  const toast = page.locator('chat2know-ui .toast');
  await expect(toast).toContainText('Added to Untitled subject › Unplaced');
  await expect(page.locator('chat2know-ui button[data-state="added"]')).toHaveText('Added');
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await page.screenshot({ path: 'tests/e2e/screenshots/page-recorded.png' });
  expect(await markdown()).toContain('- $\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V$ ([source]');

  // 撤销 takes the item and the subject it started away again.
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(plus).toHaveCount(1);
  expect(await markdown()).toBe('\n');

  await plus.first().click();
  await expect(toast).toContainText('Added to');
  // Recorded once already: after a reload the same formula is not added again, unless asked.
  await page.reload();
  await page.locator('chat2know-ui button[data-state="add"]').first().click();
  await expect(toast).toContainText('Already in Untitled subject › Unplaced');
  await toast.getByRole('button', { name: 'Add anyway' }).click();
  await expect(toast).toContainText('Added to');
  expect((await markdown()).match(/\\mathrm\{Attention\}/g)).toHaveLength(2);

  // The selection, as Alt+S and the context menu ask for it: a statement where the last item went.
  await selectText(page, 'p:has(strong)', 'keeps the softmax from saturating');
  const tabId = await tabIdOf(panel, page.url());
  await serviceWorker.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'site/recordSelection', payload: {} }), tabId);
  await expect(toast).toContainText('Added to Untitled subject › Unplaced');
  expect(await markdown()).toContain('- keeps the softmax from saturating');

  // Another origin is not ticked: no script there.
  const other = await context.newPage();
  await other.goto(`${fixtureServer.replace('127.0.0.1', 'localhost')}/synthetic-chat-katex.html`);
  await other.waitForTimeout(300);
  expect(await other.locator('chat2know-ui').count()).toBe(0);
});

test('＋ on the saved pages of the six AI sites', async ({ context, extensionId, fixtureServer }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });
  const page = await context.newPage();
  for (const [file, formulas] of Object.entries(SITE_PAGES)) {
    await page.goto(`${fixtureServer}/${file}`);
    await expect(page.locator('chat2know-ui button[data-state="add"]'), file).toHaveCount(formulas);
  }
});
