/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { generateNKeysBetween } from 'fractional-indexing';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { configureModel, send } from './helpers';

const SHOTS = 'tests/e2e/screenshots';

/** A small linear algebra map: chapters, topics, items, a grey outline topic, and two items waiting in 待归位. */
function seedMap() {
  const keys = generateNKeysBetween(null, null, 40);
  let order = 0;
  const node = (id: string, kind: string, parentId: string | undefined, title: string, extra: Record<string, unknown> = {}) => ({
    id,
    subjectId: 's',
    kind,
    ...(parentId ? { parentId } : {}),
    order: keys[order++]!,
    title,
    origin: 'user',
    createdAt: Date.UTC(2026, 9, 26),
    updatedAt: '0',
    ...extra,
  });
  const source = { url: 'https://chatgpt.com/c/demo', pageTitle: 'Chat', quoteExact: '(AB)T=BTAT', quotePrefix: '', quoteSuffix: '', capturedAt: Date.UTC(2026, 9, 30) };
  const f = (id: string, parentId: string, latex: string, extra: Record<string, unknown> = {}) => node(id, 'item', parentId, '', { itemType: 'formula', latex, ...extra });
  return [
    node('s', 'subject', undefined, '线性代数'),
    node('u', 'section', 's', '', { role: 'unplaced' }),
    f('u1', 'u', '\\mathrm{tr}(AB) = \\mathrm{tr}(BA)'),
    node('u2', 'item', 'u', '正交矩阵的逆等于它的转置', { itemType: 'statement' }),
    node('v', 'section', 's', '向量与向量空间'),
    f('v1', 'v', '\\langle x, y \\rangle = x^T y'),
    node('m', 'section', 's', '矩阵'),
    node('mm', 'section', 'm', '矩阵乘法'),
    f('mm1', 'mm', '(AB)C = A(BC)'),
    node('mt', 'section', 'm', '转置'),
    f('mt1', 'mt', '(AB)^T = B^T A^T', { source }),
    f('mt2', 'mt', '(A + B)^T = A^T + B^T'),
    node('mi', 'section', 'm', '逆矩阵'),
    f('mi1', 'mi', '(AB)^{-1} = B^{-1}A^{-1}'),
    node('mr', 'section', 'm', '秩', { origin: 'outline' }),
    node('d', 'section', 's', '行列式'),
    f('d1', 'd', '\\det(AB) = \\det A \\det B'),
    node('l', 'section', 's', '线性方程组', { origin: 'outline' }),
    node('e', 'section', 's', '特征值与特征向量'),
    f('e1', 'e', 'Av = \\lambda v'),
  ];
}

async function importSeed(panel: Page) {
  await send(panel, 'map/import', { json: JSON.stringify({ format: 'chat2know', version: 2, exportedAt: 0, nodes: seedMap() }) });
}
const markdown = async (panel: Page) => (await send<string>(panel, 'map/export', { format: 'markdown', includeGrey: true })).data;

test('side panel: empty state, the map without a model, folding, drag, edit, delete with undo, move to', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 380, height: 820 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByTestId('empty')).toContainText('Your knowledge map grows here');
  await expect(panel.getByTestId('site-chatgpt')).not.toBeChecked();

  await importSeed(panel);
  await expect(panel.getByTestId('no-model')).toBeVisible();
  const tree = panel.getByRole('tree');
  await expect(tree).toContainText('9 items');
  // 待归位 is open; chapters are folded.
  await expect(panel.getByTestId('map-item')).toHaveCount(2);
  await tree.getByRole('button', { name: '矩阵', exact: true }).click();
  await expect(tree.getByRole('button', { name: '转置', exact: true })).toBeVisible();
  await expect(tree.locator('[data-testid="map-section"]', { hasText: '秩' })).toContainText('not yet');

  // Drag an unplaced item onto a topic.
  await panel.getByTestId('map-item').filter({ hasText: '正交矩阵' }).dragTo(tree.getByRole('button', { name: '逆矩阵', exact: true }));
  await expect.poll(() => markdown(panel)).toContain('### 逆矩阵\n\n- $(AB)^{-1} = B^{-1}A^{-1}$\n- 正交矩阵的逆等于它的转置');

  // Edit through the context menu.
  await tree.getByRole('button', { name: '转置', exact: true }).click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Edit' }).click();
  await panel.keyboard.press('Control+a');
  await panel.keyboard.type('转置与对称');
  await panel.keyboard.press('Enter');
  await expect(tree.getByRole('button', { name: '转置与对称', exact: true })).toBeVisible();

  // Delete: the topic's items move up into 矩阵; Undo brings it back.
  await tree.getByRole('button', { name: '转置与对称', exact: true }).click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(panel.locator('.foot')).toContainText('Deleted "转置与对称"');
  expect(await markdown(panel)).not.toContain('转置与对称');
  await panel.locator('.foot').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => markdown(panel)).toContain('### 转置与对称');
  // Ctrl+Z undoes the latest change: the rename.
  await panel.locator('.map').click({ position: { x: 300, y: 5 } });
  await panel.keyboard.press('Control+z');
  await expect.poll(() => markdown(panel)).toContain('### 转置\n');

  // Move to… with search.
  await panel.getByTestId('map-item').filter({ hasText: 'tr' }).first().click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Move to…' }).click();
  await panel.getByPlaceholder('Type a topic name').fill('行列');
  await panel.getByRole('menuitem', { name: '线性代数 › 行列式' }).click();
  await expect.poll(() => markdown(panel)).toContain('## 行列式\n\n- $\\det(AB) = \\det A \\det B$\n- $\\mathrm{tr}(AB) = \\mathrm{tr}(BA)$');
});

test('full page: tabs, outline toggle, detail pane with sources, adding an item; settings saves and tests the model', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await importSeed(panel);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/map.html`);
  await expect(page.getByTestId('subject-tab')).toHaveText(['线性代数']);
  const map = page.getByTestId('full-map');
  await map.getByRole('button', { name: '转置', exact: true }).click();
  const detail = page.getByTestId('detail');
  await expect(detail.locator('h2')).toHaveText('转置');
  await expect(detail.locator('.entry')).toHaveCount(2);
  await expect(detail.getByRole('button', { name: /From the conversation/ })).toHaveCount(1);
  await detail.getByPlaceholder(/LaTeX/).fill('(A^T)^T = A');
  await detail.getByRole('button', { name: 'Add' }).click();
  await expect(detail.locator('.entry')).toHaveCount(3);

  await expect(map.getByRole('button', { name: '线性方程组', exact: true })).toBeVisible();
  await page.getByTestId('show-grey').uncheck();
  await expect(map.getByRole('button', { name: '线性方程组', exact: true })).toHaveCount(0);

  await page.goto(`chrome-extension://${extensionId}/map.html#settings`);
  await page.getByTestId('base-url').fill(mockLlm.url);
  await page.getByTestId('model').fill('mock-model');
  await page.getByTestId('api-key').fill('test-key');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await expect(page.getByTestId('api-key')).toHaveValue('');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByTestId('model-settings')).toContainText('● Connected');
  await page.getByTestId('record-asks').check();
  expect((await send<{ recordAsks: boolean }>(panel, 'sites/get', {})).data.recordAsks).toBe(true);
  // Saving the model placed the two items waiting in 待归位.
  await expect.poll(() => markdown(panel)).not.toContain('## Unplaced');

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('button', { name: 'Click again to delete everything' }).click();
  await expect(page.getByRole('status')).toHaveText('All data deleted.');
  expect(await markdown(panel)).toBe('\n');
});

test.describe('screenshots in Chinese, compared with the artboards', () => {
  test.use({ uiLang: 'zh-CN' });

  test('artboards 6, 7, 1, 2, 3', async ({ context, extensionId, fixtureServer, mockLlm }) => {
    mkdirSync(SHOTS, { recursive: true });
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 380, height: 820 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(panel.getByTestId('empty')).toContainText('你的知识导图会长在这里');
    await panel.screenshot({ path: `${SHOTS}/6-empty.png` });

    await importSeed(panel);
    await expect(panel.getByTestId('no-model')).toContainText('还没配置模型');
    await panel.getByRole('tree').getByRole('button', { name: '矩阵', exact: true }).click();
    await panel.screenshot({ path: `${SHOTS}/7-no-model.png` });

    // Record a formula on a page with the model set up: it lands in the map, marked 刚记下.
    await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });
    await configureModel(panel, mockLlm.url);
    await expect.poll(() => markdown(panel)).not.toContain('待归位');
    const page = await context.newPage();
    await page.goto(`${fixtureServer}/synthetic-chat-katex.html`);
    await page.locator('chat2know-ui button[data-state="add"]').click();
    await expect(page.locator('chat2know-ui .toast')).toContainText('已记到 深度学习 › 注意力机制');
    await panel.bringToFront();
    await expect(panel.getByRole('tree')).toContainText('刚记下');
    await panel.screenshot({ path: `${SHOTS}/1-sidepanel.png` });

    const full = await context.newPage();
    await full.setViewportSize({ width: 1280, height: 800 });
    await full.goto(`chrome-extension://${extensionId}/map.html`);
    await full.getByTestId('subject-tab').filter({ hasText: '线性代数' }).click();
    await full.getByTestId('full-map').getByRole('button', { name: '转置', exact: true }).click();
    await expect(full.getByTestId('detail').locator('h2')).toHaveText('转置');
    await full.screenshot({ path: `${SHOTS}/2-full-map.png` });

    await full.goto(`chrome-extension://${extensionId}/map.html#settings`);
    await expect(full.getByTestId('base-url')).toHaveValue(mockLlm.url);
    await full.screenshot({ path: `${SHOTS}/3-settings.png` });
  });
});
