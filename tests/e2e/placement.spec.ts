/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { askLater, configureModel, openPageAndPanel, selectBetween, send } from './helpers';
import type { NodeView } from '@/src/db/types';

const EN = 'synthetic-chat-katex.html';

async function keepAnswer(panel: import('@playwright/test').Page) {
  await panel.getByTestId('tab-queue').click();
  await panel.getByTestId('queue-answer-btn').click();
  await panel.getByTestId('queue-keep').click();
  await panel.getByTestId('keep-confirm').click();
}

test('a newly confirmed card is offered the most similar card as parent', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await askLater(page, '#intro', 'token');
  await keepAnswer(panel); // "What parts make up What is token?"
  await expect(panel.getByTestId('placement')).toHaveCount(0); // nothing to compare with yet

  await askLater(page, '#outro', 'attention', 'Why scale scores?');
  await keepAnswer(panel);
  await expect(panel.getByTestId('placement')).toBeVisible();
  await expect(panel.getByTestId('placement-duplicate')).toHaveCount(0);
  await expect(panel.getByTestId('placement-parent')).toHaveText(['What parts make up What is token?']);
  await panel.getByTestId('placement-parent').click();
  await expect(panel.getByTestId('placement')).toHaveCount(0);

  const nodes = (await send<NodeView[]>(panel, 'nodes/list', {})).data;
  const child = nodes.find((n) => n.originalAsk === 'Why scale scores?')!;
  const parent = nodes.find((n) => n.title === 'What parts make up What is token?')!;
  expect(child.parent).toMatchObject({ id: parent.id, kind: 'child' });
});

test('a near-duplicate concept can be merged', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  for (const sel of ['#outro', '#outro']) {
    await selectBetween(page, sel, sel);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel.getByTestId('card-confirm').first()).toBeVisible();
    await panel.getByTestId('card-confirm').first().click();
  }
  await expect(panel.getByTestId('placement-duplicate')).toContainText('What is the key idea?');
  await panel.getByTestId('placement-merge').click();
  await expect(panel.getByTestId('card')).toHaveCount(1);
  const nodes = (await send<NodeView[]>(panel, 'nodes/list', {})).data;
  expect(nodes[0]!.sources).toHaveLength(2);
});

test('without an embedding model no placement help is shown', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await send(panel, 'settings/save', { baseUrl: mockLlm.url, model: 'mock-model', embeddingModel: '', apiKey: 'test-key' });
  for (const sel of ['#outro', '#outro']) {
    await selectBetween(page, sel, sel);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel.getByTestId('card-confirm').first()).toBeVisible();
    await panel.getByTestId('card-confirm').first().click();
  }
  await expect(panel.getByTestId('card-confirm')).toHaveCount(0);
  await expect(panel.getByTestId('placement')).toHaveCount(0);
  expect(mockLlm.requests.some((r) => r.path === '/embeddings' && r.body.model === '')).toBe(false);
});
