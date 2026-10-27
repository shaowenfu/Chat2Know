/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPageAndPanel, selectBetween, send, tabIdOf } from './helpers';
import type { NodeView } from '@/src/db/types';
import { buildTree, type TreeNode } from '@/src/graph/tree';

const EN = 'synthetic-chat-katex.html';

const shape = (items: TreeNode[]): unknown => items.map((i) => (i.children.length ? { [i.node.title]: shape(i.children) } : i.node.title));
async function tree(panel: Page) {
  return shape(buildTree((await send<NodeView[]>(panel, 'nodes/list', {})).data));
}
const card = (panel: Page, title: string) => panel.locator(`[data-testid="card"][data-title="${title}"]`);

test('drag cards into a tree, reorder siblings, persist, and view conclusions', async ({ context, extensionId, fixtureServer }) => {
  const url = `${fixtureServer}/${EN}`;
  const { page, panel } = await openPageAndPanel(context, extensionId, url);
  const tabId = await tabIdOf(panel, url);
  for (const sel of ['ol li:nth-child(1)', 'ol li:nth-child(2)', 'ol li:nth-child(3)']) {
    await selectBetween(page, sel, sel);
    expect((await send(panel, 'capture/fromTab', { type: 'idea', tabId })).ok).toBe(true);
  }
  const [A, B, C] = ['Compute similarity scores.', 'Normalize them with softmax.', 'Take a weighted sum of values.'];
  await expect(panel.getByTestId('card')).toHaveCount(3);

  await card(panel, B).dragTo(card(panel, A));
  await expect.poll(() => tree(panel)).toEqual([C, { [A]: [B] }]);
  await card(panel, C).dragTo(card(panel, A));
  await expect.poll(() => tree(panel)).toEqual([{ [A]: [B, C] }]);

  // Place C before B: drop on the strip that appears above B while dragging.
  await card(panel, C).hover();
  await panel.mouse.down();
  await card(panel, B).hover(); // starts the drag so drop strips render
  await panel.getByTestId('drop-before').first().hover();
  await panel.mouse.up();
  await expect.poll(() => tree(panel)).toEqual([{ [A]: [C, B] }]);

  await panel.reload();
  await expect.poll(() => tree(panel)).toEqual([{ [A]: [C, B] }]);
  await panel.setViewportSize({ width: 400, height: 640 });
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await panel.screenshot({ path: 'tests/e2e/screenshots/tree.png' });

  await panel.getByTestId('mode-conclusion').click();
  await expect(panel.getByTestId('outline-item')).toHaveText([A, C, B]);
  await panel.getByTestId('mode-explore').click();

  await card(panel, B).hover();
  await panel.mouse.down();
  await card(panel, C).hover();
  await panel.getByTestId('drop-root').hover();
  await panel.mouse.up();
  await expect.poll(() => tree(panel)).toEqual([B, { [A]: [C] }]); // top level is newest first
});

test('a card cannot be dropped under its own descendant', async ({ context, extensionId, fixtureServer }) => {
  const url = `${fixtureServer}/${EN}`;
  const { page, panel } = await openPageAndPanel(context, extensionId, url);
  const tabId = await tabIdOf(panel, url);
  for (const sel of ['ol li:nth-child(1)', 'ol li:nth-child(2)']) {
    await selectBetween(page, sel, sel);
    await send(panel, 'capture/fromTab', { type: 'idea', tabId });
  }
  const [A, B] = ['Compute similarity scores.', 'Normalize them with softmax.'];
  await card(panel, B).dragTo(card(panel, A));
  await expect.poll(() => tree(panel)).toEqual([{ [A]: [B] }]);
  await card(panel, A).dragTo(card(panel, B));
  await expect(panel.getByRole('status')).toHaveText('A card cannot be moved under itself');
  await expect.poll(() => tree(panel)).toEqual([{ [A]: [B] }]);
});
