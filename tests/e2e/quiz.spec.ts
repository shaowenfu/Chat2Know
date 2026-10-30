/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { configureModel, openPageAndPanel, selectBetween, send } from './helpers';

const EN = 'synthetic-chat-katex.html';

test('mark a card "know by heart", quiz it, and see the north star move', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await selectBetween(page, '#outro', '#outro');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByTestId('card-confirm').click(); // first title candidate
  await panel.getByTestId('mastery-internalize').click();
  await expect(panel.getByTestId('mastery-internalize')).toHaveAttribute('aria-pressed', 'true');

  await panel.getByTestId('tab-quiz').click();
  await expect(panel.getByTestId('quiz-question')).toHaveText('What is the key idea?');
  await expect(panel.getByTestId('stat-north-star')).toHaveText('0');
  await panel.getByRole('textbox', { name: 'Answer from memory' }).fill('attention is a lookup');
  await panel.getByTestId('quiz-reveal').click();
  await expect(panel.getByTestId('quiz-expected')).toHaveText('Distilled: In short: attention is a learned, content-based lookup.');
  await panel.setViewportSize({ width: 400, height: 600 });
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await panel.screenshot({ path: 'tests/e2e/screenshots/quiz.png' });
  await panel.getByTestId('quiz-pass').click();

  await expect(panel.getByTestId('quiz-result')).toHaveText('Got it');
  await expect(panel.getByTestId('stat-north-star')).toHaveText('1');
  await expect(panel.getByTestId('quiz-empty')).toHaveText('Nothing due. Come back later.');
});

test('AI judge grades the answer against the kept statement', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await selectBetween(page, '#outro', '#outro');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByTestId('card-confirm').click();
  await panel.getByTestId('mastery-internalize').click();
  await panel.getByTestId('tab-quiz').click();

  await panel.getByRole('textbox', { name: 'Answer from memory' }).fill('no clue at all');
  await panel.getByTestId('quiz-judge').click();
  await expect(panel.getByTestId('quiz-result')).toHaveText('Forgot · Misses the key point.');
  await expect(panel.getByTestId('stat-north-star')).toHaveText('0');
});

test('cards not marked "know by heart" are never quizzed', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByTestId('tab-quiz').click();
  await expect(panel.getByTestId('quiz-empty')).toHaveText('Mark cards as "Know by heart" to be quizzed on them.');
});

test('the next quiz of a card asks to use it on a problem the model writes', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  // A card to know by heart, recalled once before and due again.
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const node = {
    id: '01JAPPLYCARD0000000000000',
    type: 'knowledge',
    title: 'Why scale attention scores?',
    summary: 'Scaling keeps the softmax away from saturation.',
    mastery: 'internalize',
    status: 'mastered',
    askCount: 0,
    createdAt: now - 3 * day,
    updatedAt: '0000000000001-0000-imp',
  };
  const review = { id: '01JAPPLYREVIEW00000000000', nodeId: node.id, mode: 'recall', prompt: node.title, answer: 'saturation', verdict: 'pass', dueAt: now - day, interval: 1, createdAt: now - 2 * day };
  const file = { format: 'chat2know', version: 1, exportedAt: now, nodes: [node], edges: [], sources: [], reviews: [review], preferences: [] };
  expect((await send(panel, 'data/importJson', { json: JSON.stringify(file) })).ok).toBe(true);

  await panel.getByTestId('tab-quiz').click();
  await expect(panel.getByTestId('quiz-problem')).toHaveText('Problem: use this to solve a case. Why scale attention scores?');
  await panel.getByRole('textbox', { name: 'Your solution' }).fill('divide by sqrt(d) to avoid saturation');
  await panel.getByTestId('quiz-judge').click();
  await expect(panel.getByTestId('quiz-result')).toHaveText('Got it · Covers the key point.');
  await expect(panel.getByTestId('stat-north-star')).toHaveText('1');
});
