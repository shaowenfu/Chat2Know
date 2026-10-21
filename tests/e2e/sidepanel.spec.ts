/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { selectBetween, send, tabIdOf } from './helpers';
import type { NodeView } from '@/src/db/types';

const CHAT = 'synthetic-chat-katex.html';

test('extension registers the side panel, shortcuts and permissions', async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.side_panel?.default_path).toBe('sidepanel.html');
  expect(Object.keys(manifest.commands ?? {})).toEqual(expect.arrayContaining(['capture-knowledge', 'capture-idea']));
  expect(manifest.permissions).toEqual(expect.arrayContaining(['activeTab', 'scripting', 'sidePanel']));
  const behavior = await serviceWorker.evaluate(() => chrome.sidePanel.getPanelBehavior());
  expect(behavior.openPanelOnActionClick).toBe(true);
});

test('side panel shows the empty state and reaches the background', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Chat2Know' })).toBeVisible();
  await expect(panel.getByTestId('empty')).toBeVisible();
  expect((await send(panel, 'ping', { from: 'sidepanel' })).ok).toBe(true);
});

test('selection toolbar saves a card with LaTeX restored', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  expect((await send(panel, 'page/activate', { tabId: await tabIdOf(panel, url) })).ok).toBe(true);

  await selectBetween(page, '#intro', '.katex-display');
  await expect(page.getByRole('toolbar')).toBeVisible();
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await page.screenshot({ path: 'tests/e2e/screenshots/toolbar.png', clip: { x: 0, y: 0, width: 900, height: 420 } });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved ✓');

  const card = panel.getByTestId('card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Attention lets each token weigh every other token');
  await expect(panel.getByTestId('card-count')).toHaveText('1 card');

  const { data: nodes } = await send<NodeView[]>(panel, 'nodes/list', {});
  expect(nodes[0]!.type).toBe('knowledge');
  expect(nodes[0]!.body).toContain('For queries $Q$, keys $K$ and values $V$:');
  expect(nodes[0]!.body).toContain('$$\n\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V\n$$');
  expect(nodes[0]!.sources[0]).toMatchObject({ url, pageTitle: 'Synthetic chat: attention' });
  expect(nodes[0]!.sources[0]!.quoteExact.startsWith('Attention lets each token')).toBe(true);

  await panel.setViewportSize({ width: 400, height: 600 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/sidepanel.png' });
});

test('shortcut / context-menu path captures code and tables as an idea', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await selectBetween(page, 'pre', 'table');
  const res = await send(panel, 'capture/fromTab', { type: 'idea', tabId: await tabIdOf(panel, url) });
  expect(res.ok).toBe(true);

  const { data: nodes } = await send<NodeView[]>(panel, 'nodes/list', {});
  expect(nodes[0]!.type).toBe('idea');
  expect(nodes[0]!.body).toContain('```python\ndef attention(q, k, v):');
  expect(nodes[0]!.body).toContain('| Linear attention | $O(n)$ | Approximate \\| kernel trick |');
  expect(nodes[0]!.body).not.toContain('Copy code');
});

test('capturing with nothing selected reports an error', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const res = await send(panel, 'capture/fromTab', { type: 'knowledge', tabId: await tabIdOf(panel, url) });
  expect(res).toMatchObject({ ok: false, error: 'No text selected' });
});

test('opening a source jumps back to the page and highlights the quote', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await selectBetween(page, '#outro', '#outro');
  expect((await send(panel, 'capture/fromTab', { type: 'knowledge', tabId: await tabIdOf(panel, url) })).ok).toBe(true);

  const [opened] = await Promise.all([context.waitForEvent('page'), panel.getByTestId('open-source').click()]);
  await opened.waitForLoadState();
  expect(opened.url()).toBe(`${url}#:~:text=In%20short%3A%20attention%20is%20a%20learned%2C%20content%2Dbased%20lookup.`);
  await expect(opened.locator('html')).toHaveAttribute('data-chat2know-highlight', 'In short: attention is a learned, content-based lookup.');
  const highlighted = await opened.evaluate(() => {
    const h = CSS.highlights.get('chat2know');
    return h ? [...h][0]!.toString() : null;
  });
  expect(highlighted).toBe('In short: attention is a learned, content-based lookup.');
});

test('export JSON, delete, import restores the card; Markdown export works', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await selectBetween(page, '#intro', '#intro');
  await send(panel, 'capture/fromTab', { type: 'knowledge', tabId: await tabIdOf(panel, url) });
  await expect(panel.getByTestId('card')).toHaveCount(1);

  const [jsonDownload] = await Promise.all([panel.waitForEvent('download'), panel.getByTestId('export-json').click()]);
  const jsonPath = await jsonDownload.path();
  expect(jsonDownload.suggestedFilename()).toMatch(/^chat2know-\d{4}-\d{2}-\d{2}\.json$/);

  const [mdDownload] = await Promise.all([panel.waitForEvent('download'), panel.getByTestId('export-md').click()]);
  const md = await (await import('node:fs/promises')).readFile(await mdDownload.path(), 'utf8');
  expect(md).toContain('# Chat2Know export');
  expect(md).toContain(`Source: [Synthetic chat: attention](${url})`);

  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(panel.getByTestId('card')).toHaveCount(0);

  await panel.getByTestId('import-input').setInputFiles(jsonPath);
  await expect(panel.getByRole('status')).toHaveText('Imported 1 card');
  await expect(panel.getByTestId('card')).toHaveCount(1);
});

test('importing a non-Chat2Know file shows an error', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(panel.getByRole('status')).toHaveText('Import failed: Not a Chat2Know export file');
});
