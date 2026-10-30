/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { configureModel, send, tabIdOf } from './helpers';

const PAGE = 'synthetic-chat-input.html';

test('records questions sent on a ticked site, and nothing when paused, elsewhere or in a password field', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  await page.goto(`${fixtureServer}/${PAGE}`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const asks = async () => (await send<{ text: string; site: string }[]>(panel, 'asks/list', {})).data.map((a) => a.text);
  // The page clears its box after sending, as chat sites do.
  const sendWithEnter = async (text: string) => {
    await page.locator('#prompt').fill(text);
    await page.locator('#prompt').press('Enter');
    await page.locator('#prompt').fill('');
  };

  // Not ticked yet: nothing is recorded (the recorder is not even on the page).
  await sendWithEnter('before enabling');
  expect((await send(panel, 'recording/setOrigins', { origins: [fixtureServer] })).ok).toBe(true);
  expect(await panel.evaluate(() => chrome.action.getBadgeText({}))).toBe('REC');

  // Already open tab gets the recorder at once.
  await sendWithEnter('why does the order reverse?');
  await page.locator('#editor').fill('what is a transpose?');
  await page.locator('#rich-send').click();
  await page.locator('#editor').fill('');
  await expect.poll(asks).toEqual(['what is a transpose?', 'why does the order reverse?']);

  await page.locator('#password').fill('hunter2');
  await page.locator('#password').press('Enter');
  await page.locator('#password').fill('');

  await send(panel, 'recording/setPaused', { paused: true });
  expect(await panel.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
  await sendWithEnter('asked while paused');
  await page.waitForTimeout(500); // the recorder reports once the box has cleared
  await send(panel, 'recording/setPaused', { paused: false });

  // Another origin (same server) is not ticked.
  const other = await context.newPage();
  await other.goto(`${fixtureServer.replace('127.0.0.1', 'localhost')}/${PAGE}`);
  await other.locator('#prompt').fill('on another site');
  await other.locator('#prompt').press('Enter');
  await other.locator('#prompt').fill('');

  // A reload runs the registered recorder again.
  await page.reload();
  await sendWithEnter('after reload');
  await expect.poll(asks).toEqual(['after reload', 'what is a transpose?', 'why does the order reverse?']);
  expect((await send<{ site: string }[]>(panel, 'asks/list', {})).data[0]!.site).toBe('127.0.0.1');

  // Excluding the conversation deletes its questions and stops recording it.
  await send(panel, 'asks/exclude', { conversationUrl: page.url() });
  await sendWithEnter('in an excluded conversation');
  await page.waitForTimeout(300);
  expect(await asks()).toEqual([]);
  expect(await tabIdOf(panel, page.url())).toBeGreaterThan(0);
});

test('Learning tab: tick sites, pause, search and delete recorded questions', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  await page.goto(`${fixtureServer}/${PAGE}`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await send(panel, 'recording/setOrigins', { origins: [fixtureServer] });
  for (const q of ['why does (AB)ᵀ reverse the order?', 'what is a trace?']) {
    await page.locator('#prompt').fill(q);
    await page.locator('#prompt').press('Enter');
    await page.locator('#prompt').fill('');
  }

  await panel.getByTestId('tab-learn').click();
  await expect(panel.getByTestId('ask')).toHaveCount(2);
  await expect(panel.getByTestId(`site-${fixtureServer}`)).toBeChecked();

  await panel.getByTestId('site-chatgpt').check();
  await expect.poll(async () => (await send<{ origins: string[] }>(panel, 'recording/get', {})).data.origins).toEqual([
    fixtureServer,
    'https://chatgpt.com',
    'https://chat.openai.com',
  ]);
  await panel.getByTestId('site-chatgpt').uncheck();
  await expect(panel.getByTestId('site-chatgpt')).not.toBeChecked();

  await panel.getByTestId('recording-pause').click();
  await expect(panel.getByTestId('recording-state')).toHaveText('Paused, nothing is recorded');

  await panel.getByRole('searchbox', { name: 'Search my questions' }).fill('trace');
  await expect(panel.getByTestId('ask')).toHaveCount(1);
  await panel.getByRole('searchbox', { name: 'Search my questions' }).fill('');
  await panel.setViewportSize({ width: 400, height: 640 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/learn.png' });

  await panel.getByTestId('ask-delete').first().click();
  await expect(panel.getByTestId('ask')).toHaveCount(1);
  panel.once('dialog', (d) => void d.accept());
  await panel.getByTestId('asks-clear').click();
  await expect(panel.getByTestId('asks-empty')).toBeVisible();
});

test('Analyze now tags waiting questions; a failure is kept and shown', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const page = await context.newPage();
  await page.goto(`${fixtureServer}/${PAGE}`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url, 'wrong-key');
  await send(panel, 'recording/setOrigins', { origins: [fixtureServer] });
  for (const q of ['why does the transpose reverse a product?', 'what is the trace of AB?']) {
    await page.locator('#prompt').fill(q);
    await page.locator('#prompt').press('Enter');
    await page.locator('#prompt').fill('');
  }
  await panel.getByTestId('tab-learn').click();
  await expect(panel.getByTestId('analysis-pending')).toHaveText('2 questions waiting for analysis');

  await panel.getByTestId('analyze-now').click();
  await expect(panel.getByTestId('analysis-error')).toHaveText('Last analysis failed: HTTP 401: Invalid API key');

  await configureModel(panel, mockLlm.url);
  await panel.getByTestId('analyze-now').click();
  await expect(panel.getByTestId('analysis-pending')).toHaveCount(0);
  await expect(panel.getByTestId('analysis-error')).toHaveCount(0);
  await expect(panel.getByTestId('ask-concepts')).toHaveText(['Trace properties', 'Transpose properties']);
});

test('ten waiting questions start an analysis on their own', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const page = await context.newPage();
  await page.goto(`${fixtureServer}/${PAGE}`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  await send(panel, 'recording/setOrigins', { origins: [fixtureServer] });
  for (let i = 1; i <= 10; i++) {
    await page.locator('#prompt').fill(`question ${i}: why does the transpose reverse a product?`);
    await page.locator('#prompt').press('Enter');
    await page.locator('#prompt').fill('');
    await page.waitForTimeout(80); // each send is its own message
  }
  await expect.poll(async () => (await send<{ pending: number }>(panel, 'analysis/get', {})).data.pending).toBe(0);
  const asks = (await send<{ concepts: string[] }[]>(panel, 'asks/list', {})).data;
  expect(asks).toHaveLength(10);
  expect(asks.every((a) => a.concepts.includes('Transpose properties'))).toBe(true);
});
