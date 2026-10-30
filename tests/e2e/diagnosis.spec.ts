/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { configureModel, send } from './helpers';

const PAGE = 'synthetic-chat-input.html';
const TROUBLE: [string, string][] = [
  ['why does the transpose reverse a product?', '1'],
  ['transpose of a sum?', '2'],
  ['transpose of an inverse?', '3'],
  ['why is matrix multiplication not commutative?', '1'],
  ['order of multiplication in ABC?', '4'],
  ['when can I swap a multiplication?', '5'],
];

test('questions sent on a site become a diagnosis; the quiz confirms it; the review is kept as cards to know by heart', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  await send(panel, 'recording/setOrigins', { origins: [fixtureServer] });
  const page = await context.newPage();
  for (const [i, [text, conversation]] of TROUBLE.entries()) {
    await page.goto(`${fixtureServer}/${PAGE}?c=${conversation}`);
    await page.locator('#prompt').fill(text);
    await page.locator('#prompt').press('Enter');
    await page.locator('#prompt').fill('');
    // Recorded once the box has cleared; wait before leaving the page.
    await expect.poll(async () => (await send<unknown[]>(panel, 'asks/list', {})).data.length).toBe(i + 1);
  }

  await panel.getByTestId('tab-learn').click();
  await panel.getByTestId('analyze-now').click();
  await expect(panel.getByTestId('learn-pill')).toHaveText('1');
  const card = panel.getByTestId('diagnosis');
  await expect(card.getByTestId('diagnosis-state')).toHaveText('Possible gap');
  await expect(card.getByTestId('diagnosis-hypothesis')).toContainText('6 of your questions were about');
  await expect(card.getByTestId('diagnosis-hypothesis')).toContainText('Going over Matrix operation rules systematically may help.');
  await card.locator('summary').click();
  await expect(card.getByTestId('diagnosis-evidence')).toHaveCount(6);
  await expect(card.getByTestId('diagnosis-evidence').first().getByRole('link')).toHaveAttribute('href', /\?c=\d$/);

  await card.getByTestId('diagnosis-quiz').click();
  await card.getByRole('textbox', { name: 'Quiz 1 on Matrix operation rules?' }).fill('no idea');
  await card.getByTestId('diagnosis-check').click();
  await expect(card.getByTestId('diagnosis-result')).toHaveCount(3);
  await expect(card.getByTestId('diagnosis-state')).toHaveText('Confirmed gap');
  await expect(panel.getByTestId('learn-pill')).toHaveCount(0);

  await card.getByTestId('diagnosis-review').click();
  await expect(card.getByTestId('review-internalize')).toBeChecked();
  await panel.setViewportSize({ width: 400, height: 900 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/diagnosis.png' });
  await card.getByTestId('review-keep').click();
  await expect(panel.getByRole('status')).toHaveText('Kept 2 cards under the concept');

  await panel.getByTestId('tab-cards').click();
  const topic = panel.locator('[data-testid="card"][data-title="Matrix operation rules"]');
  await expect(topic).toBeVisible();
  await expect(panel.locator('[data-testid="card"][data-title="What is Matrix basics?"] [data-testid="mastery-internalize"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(topic.getByTestId('card-gap')).toHaveText('Weak spot');
  await panel.screenshot({ path: 'tests/e2e/screenshots/map-gap.png' });

  // Passing both review cards in Quiz me strengthens the spot.
  await panel.getByTestId('tab-quiz').click();
  for (let i = 0; i < 2; i++) {
    await expect(panel.getByTestId('quiz-question')).toHaveText(/What is Matrix (basics|operation rules)\?/);
    await panel.getByTestId('quiz-reveal').click();
    await panel.getByTestId('quiz-pass').click();
  }
  await expect(panel.getByTestId('quiz-empty')).toBeVisible();
  await panel.getByTestId('tab-cards').click();
  await expect(topic.getByTestId('card-gap')).toHaveText('Strengthened ✓');
  await panel.getByTestId('tab-learn').click();
  await expect(panel.getByTestId('diagnosis-state')).toHaveText('Strengthened ✓');
});
