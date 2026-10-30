/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { send, tabIdOf } from './helpers';

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
