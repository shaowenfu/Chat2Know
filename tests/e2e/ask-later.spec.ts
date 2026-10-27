/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { selectText, send, tabIdOf } from './helpers';
import type { NodeView } from '@/src/db/types';

const CHAT = 'synthetic-chat-katex.html';

test('ask later: chip question, sentence quote, underline, no network', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  expect((await send(panel, 'page/activate', { tabId: await tabIdOf(panel, url) })).ok).toBe(true);

  // From here on, ask-later must not touch the network.
  const requests: string[] = [];
  context.on('request', (r) => {
    if (!r.url().startsWith('chrome-extension://')) requests.push(r.url());
  });

  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask later', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your question (optional)' })).toBeFocused();
  await page.getByRole('button', { name: 'What is token?' }).click();
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await page.screenshot({ path: 'tests/e2e/screenshots/ask-later.png', clip: { x: 0, y: 0, width: 900, height: 360 } });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Added to Ask later');

  const underlined = await page.evaluate(() => [...(CSS.highlights.get('chat2know-ask') ?? [])].map((r) => r.toString()));
  expect(underlined).toEqual(['token']);

  const { data: nodes } = await send<NodeView[]>(panel, 'nodes/list', {});
  const q = nodes.find((n) => n.type === 'question')!;
  expect(q).toMatchObject({ title: 'What is token?', term: 'token', status: 'open', askCount: 1 });
  expect(q.sources[0]!.quoteExact).toBe('Attention lets each token weigh every other token.');

  await panel.getByTestId('tab-queue').click();
  await expect(panel.getByTestId('queue-question')).toHaveText('What is token?');
  await expect(panel.getByTestId('queue-quote')).toHaveText('Attention lets each token weigh every other token.');
  await expect(panel.getByTestId('tab-cards')).not.toContainText('1'); // questions are not cards

  expect(requests).toEqual([]);
});

test('ask later: Esc saves without a question; asking again merges and counts', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const tabId = await tabIdOf(panel, url);
  await send(panel, 'page/activate', { tabId });

  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask later', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toHaveText('Added to Ask later');

  // Second time via the shortcut / context-menu path, on another sentence.
  await selectText(page, '#outro', 'attention');
  await selectText(page, '#intro', 'token');
  expect((await send(panel, 'ask/fromTab', { tabId })).ok).toBe(true);
  await page.getByRole('textbox').fill('Is a token a word?');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Added to Ask later · asked 2 times');

  await panel.getByTestId('tab-queue').click();
  await expect(panel.getByTestId('queue-item')).toHaveCount(1);
  await expect(panel.getByTestId('queue-question')).toHaveText('Is a token a word?');
  await expect(panel.getByTestId('queue-repeat')).toHaveText('Asked 2 times');

  await panel.setViewportSize({ width: 400, height: 600 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/queue.png' });
});

test('ask later underlines are restored after reload', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await send(panel, 'page/activate', { tabId: await tabIdOf(panel, url) });
  await selectText(page, '#answer p:nth-of-type(2)', 'scaling factor');
  await page.getByRole('button', { name: 'Ask later', exact: true }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toBeVisible();

  await page.reload();
  await send(panel, 'page/activate', { tabId: await tabIdOf(panel, url) });
  await expect
    .poll(() => page.evaluate(() => [...(CSS.highlights.get('chat2know-ask') ?? [])].map((r) => r.toString())))
    .toEqual(['scaling factor']);
});

test('queue: write the question later, copy a follow-up, remove', async ({ context, extensionId, fixtureServer }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const url = `${fixtureServer}/${CHAT}`;
  await page.goto(url);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await send(panel, 'page/activate', { tabId: await tabIdOf(panel, url) });
  await selectText(page, '#intro', 'token');
  await page.getByRole('button', { name: 'Ask later', exact: true }).click();
  await page.keyboard.press('Escape');

  await panel.getByTestId('tab-queue').click();
  await expect(panel.getByTestId('queue-question')).toHaveText('About "token"');
  await panel.getByRole('button', { name: 'Write question' }).click();
  await panel.getByRole('textbox', { name: 'Write question' }).fill('Why per token?');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByTestId('queue-question')).toHaveText('Why per token?');

  await panel.getByTestId('queue-copy').click();
  await expect(panel.getByRole('status')).toHaveText('Copied. Paste it into the chat to ask there.');
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe(
    'About this sentence: "Attention lets each token weigh every other token."\nMy question: Why per token?',
  );

  await panel.getByRole('button', { name: 'Remove' }).click();
  await expect(panel.getByTestId('queue-empty')).toBeVisible();
});
