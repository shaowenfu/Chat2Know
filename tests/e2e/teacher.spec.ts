/// <reference types="chrome" />
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { configureModel, send } from './helpers';

/** Imports a kept card "What does attention do?" with a kept child card "Why scale the scores?". */
async function importBranch(panel: Page) {
  const now = Date.now();
  const card = (id: string, title: string, summary: string) => ({
    id,
    type: 'knowledge',
    title,
    summary,
    status: 'confirmed',
    askCount: 0,
    createdAt: now,
    updatedAt: `000000000000${id.slice(-1)}-0000-imp`,
  });
  const file = {
    format: 'chat2know',
    version: 1,
    exportedAt: now,
    nodes: [
      card('01JROOT000000000000000000A', 'What does attention do?', 'Attention mixes values weighted by query and key similarity.'),
      card('01JCHILD00000000000000000B', 'Why scale the scores?', 'Scaling keeps the softmax away from saturation.'),
    ],
    edges: [{ id: '01JEDGE000000000000000000C', from: '01JROOT000000000000000000A', to: '01JCHILD00000000000000000B', kind: 'child', order: 'a0' }],
    sources: [],
    reviews: [],
    preferences: [],
  };
  expect((await send(panel, 'data/importJson', { json: JSON.stringify(file) })).ok).toBe(true);
}

test('explain a branch: each card is checked, the missed one is marked on the map', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  await importBranch(panel);

  const root = panel.locator('[data-testid="card"][data-title="What does attention do?"]');
  await root.getByTestId('explain').click();
  await root.getByRole('textbox', { name: /Explain this/ }).fill('Attention mixes the values, weighted by how similar query and key are.');
  await root.getByTestId('explain-check').click();
  await expect(root.getByTestId('explain-point')).toHaveText([
    'Got it · What does attention do? — Explained.',
    'Forgot · Why scale the scores? — Missing.',
  ]);
  const child = panel.locator('[data-testid="card"][data-title="Why scale the scores?"]');
  await expect(child.getByTestId('card-flag')).toHaveText('Missed last check');
  await expect(root.getByTestId('card-flag')).toHaveCount(0);
  await panel.setViewportSize({ width: 400, height: 700 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/explain.png' });
});

test('one-minute script from a branch, ready to copy', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  await importBranch(panel);
  const root = panel.locator('[data-testid="card"][data-title="What does attention do?"]');
  await root.getByTestId('one-minute').click();
  await expect(root.getByTestId('one-minute-script')).toHaveText('In one minute: What does attention do? comes down to 2 points.');
});
