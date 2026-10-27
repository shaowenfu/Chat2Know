/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { configureModel, openPageAndPanel, selectText, send } from './helpers';
import type { NodeView } from '@/src/db/types';
import { buildTree } from '@/src/graph/tree';

const EN = 'synthetic-chat-katex.html';

test('ask now answers in the side panel without touching the host page', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  const before = await page.evaluate(() => document.body.innerHTML);

  await selectText(page, '#answer p:nth-of-type(2)', 'softmax');
  await page.getByRole('button', { name: 'Ask now', exact: true }).click();
  await page.getByRole('textbox').fill('Why softmax here?');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Answer is in the side panel');

  expect(await page.evaluate(() => document.body.innerHTML)).toBe(before);
  expect(await page.evaluate(() => CSS.highlights.has('chat2know-ask'))).toBe(false);

  await panel.getByTestId('tab-queue').click();
  await expect(panel.getByTestId('queue-answer')).toHaveText('Mock answer to: Why softmax here?');
});

test('Esc or clicking away cancels ask now without calling the model', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  const before = mockLlm.requests.length;
  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask now', exact: true }).click();
  await page.keyboard.press('Escape');
  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask now', exact: true }).click();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('toolbar')).toBeHidden();
  expect(mockLlm.requests.length).toBe(before);
  expect((await send<NodeView[]>(panel, 'nodes/list', {})).data).toEqual([]);
});

test('ask now shows the model error on the page toolbar', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url, 'wrong-key');
  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask now', exact: true }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('HTTP 401: Invalid API key');
  // The question itself is kept in the queue, so nothing is lost.
  await panel.getByTestId('tab-queue').click();
  await expect(panel.getByTestId('queue-item')).toHaveCount(1);
});

test('a follow-up on an answer becomes its child in the tree once both are kept', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask now', exact: true }).click();
  await page.getByRole('textbox').fill('What is a token?');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Answer is in the side panel');

  await panel.getByTestId('tab-queue').click();
  await panel.getByTestId('follow-up').click();
  await panel.getByRole('textbox', { name: 'Ask a follow-up question' }).fill('Are tokens words?');
  await panel.getByRole('textbox', { name: 'Ask a follow-up question' }).press('Enter');
  await expect(panel.getByTestId('queue-item')).toHaveCount(2);
  await expect(panel.getByTestId('queue-arose')).toHaveText('Follow-up to: What is a token?');
  const last = mockLlm.requests.at(-1)!.body.messages!.map((m) => m.content).join('\n');
  expect(last).toContain('I was exploring: What is a token?');

  // Keep the parent, then the follow-up.
  for (let i = 0; i < 2; i++) {
    await panel.getByTestId('queue-keep').last().click();
    await panel.getByTestId('keep-confirm').click();
  }
  await expect(panel.getByTestId('queue-empty')).toBeVisible();
  const nodes = (await send<NodeView[]>(panel, 'nodes/list', {})).data;
  const tree = buildTree(nodes.filter((n) => n.type !== 'question'));
  expect(tree).toHaveLength(1);
  expect(tree[0]!.children.map((c) => c.node.originalAsk)).toEqual(['Are tokens words?']);
});
