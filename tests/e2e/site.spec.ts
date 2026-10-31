/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { configureModel, selectText, send, tabIdOf } from './helpers';

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
  test.setTimeout(90_000); // large saved pages whose external assets are blocked
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });
  const page = await context.newPage();
  for (const [file, formulas] of Object.entries(SITE_PAGES)) {
    await page.goto(`${fixtureServer}/${file}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('chat2know-ui button[data-state="add"]'), file).toHaveCount(formulas);
  }
});

test('with a model, the recorded formula moves to its topic and the toast follows; a model error keeps it in Unplaced', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });
  await configureModel(panel, mockLlm.url, 'wrong-key');
  const page = await context.newPage();
  await page.goto(`${fixtureServer}/synthetic-chat-katex.html`);
  const toast = page.locator('chat2know-ui .toast');

  await page.locator('chat2know-ui button[data-state="add"]').click();
  await expect(toast).toContainText('Kept in Unplaced: HTTP 401: Invalid API key');
  await toast.getByRole('button', { name: 'Undo' }).click();

  await configureModel(panel, mockLlm.url);
  await page.locator('chat2know-ui button[data-state="add"]').click();
  await expect(toast).toContainText('Added to 深度学习 › 注意力机制');
  const md = (await send<string>(panel, 'map/export', { format: 'markdown' })).data;
  expect(md).toMatch(/^# 深度学习\n\n## 注意力机制\n\n- \$\\mathrm\{Attention\}/);
  // 撤销 takes back the record and the placement together.
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await send<string>(panel, 'map/export', { format: 'markdown' })).data).toBe('\n');
});

test('改位置: the picker offers places, searches, and moves the item; the toast says where', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const node = (id: string, kind: string, parentId: string | undefined, subjectId: string, title: string) => ({
    id,
    subjectId,
    kind,
    ...(parentId ? { parentId } : {}),
    order: `a${id}`,
    title,
    origin: 'user',
    createdAt: 0,
    updatedAt: '0',
  });
  const map = [
    node('1', 'subject', undefined, '1', '线性代数'),
    node('2', 'section', '1', '1', '矩阵'),
    node('3', 'section', '2', '1', '转置'),
    node('4', 'section', '2', '1', '迹'),
    node('5', 'subject', undefined, '5', '深度学习'),
    node('6', 'section', '5', '5', '注意力机制'),
    node('7', 'section', '5', '5', '优化'),
  ];
  await send(panel, 'map/import', { json: JSON.stringify({ format: 'chat2know', version: 2, exportedAt: 0, nodes: map }) });
  await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });
  await configureModel(panel, mockLlm.url);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(`${fixtureServer}/synthetic-chat-katex.html`);
  const toast = page.locator('chat2know-ui .toast');
  await page.locator('chat2know-ui button[data-state="add"]').click();
  await expect(toast).toContainText('Added to 深度学习 › 注意力机制');
  await toast.getByRole('button', { name: 'Move' }).click();

  const picker = page.locator('chat2know-ui .picker');
  await expect(picker).toContainText('Where should it go?');
  await expect(picker).toContainText('Now in: 注意力机制');
  await expect(picker.locator('.picker-option')).toHaveCount(3);
  await page.screenshot({ path: 'tests/e2e/screenshots/page-relocate.png' });

  await picker.getByPlaceholder('Type a topic name').fill('迹');
  await expect(picker.locator('.picker-option')).toHaveText(['线性代数 › 矩阵 › 迹']);
  await picker.getByRole('button', { name: 'Move' }).click();
  await expect(picker).toHaveCount(0);
  await expect(toast).toContainText('Moved to 线性代数 › 矩阵 › 迹');
  expect((await send<string>(panel, 'map/export', { format: 'markdown' })).data).toContain('### 迹\n\n- $\\mathrm{Attention}');

  // Undo puts it back where placement had filed it.
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await send<string>(panel, 'map/export', { format: 'markdown' })).data).toContain('## 注意力机制\n\n- $\\mathrm{Attention}');
});
