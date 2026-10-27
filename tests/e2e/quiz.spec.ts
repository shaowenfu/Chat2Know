/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { configureModel, openPageAndPanel, selectBetween } from './helpers';

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
