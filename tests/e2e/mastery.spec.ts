/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { askLater, configureModel, openPageAndPanel, selectBetween } from './helpers';

const EN = 'synthetic-chat-katex.html';

test('a term asked three times prompts "know by heart", which carries over when kept', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  for (let i = 0; i < 3; i++) await askLater(page, '#intro', 'token');

  await panel.getByTestId('tab-queue').click();
  await expect(panel.getByTestId('queue-repeat')).toHaveText('Asked 3 times');
  await panel.getByTestId('queue-must-know').click();
  await expect(panel.getByTestId('queue-must-know')).toHaveCount(0);

  await panel.getByTestId('queue-answer-btn').click();
  await panel.getByTestId('queue-keep').click();
  await panel.getByTestId('keep-confirm').click();
  await panel.getByTestId('tab-cards').click();
  await expect(panel.getByTestId('mastery-internalize')).toHaveAttribute('aria-pressed', 'true');
});

test('unset cards show the suggested mastery, one click confirms it', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await selectBetween(page, '#outro', '#outro');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByTestId('card-confirm').click();
  await expect(panel.getByTestId('mastery-suggested')).toHaveText(' · suggested');
  await expect(panel.getByTestId('mastery-understand')).toContainText('Understand');
  await panel.getByTestId('mastery-understand').click();
  await expect(panel.getByTestId('mastery-understand')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByTestId('mastery-suggested')).toHaveCount(0);
});
