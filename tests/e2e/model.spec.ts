/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { askLater, configureModel, openPageAndPanel, selectBetween, send } from './helpers';
import type { NodeView } from '@/src/db/types';

const EN = 'synthetic-chat-katex.html';
const ZH = 'synthetic-chat-zh.html';

test('settings: save, test connection, wrong key surfaces the provider error', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByTestId('needs-model')).toBeVisible();
  await panel.getByTestId('open-settings').click();

  await panel.getByLabel('Base URL').fill(mockLlm.url);
  await panel.getByLabel('Model', { exact: true }).fill('mock-model');
  await panel.getByLabel('API key').fill('wrong-key');
  await panel.getByTestId('settings-save').click();
  await expect(panel.getByRole('status')).toHaveText('Settings saved');
  await panel.getByTestId('settings-test').click();
  await expect(panel.getByRole('status')).toHaveText('HTTP 401: Invalid API key');

  await panel.getByLabel('API key').fill('test-key');
  await panel.getByTestId('settings-save').click();
  await expect(panel.getByLabel('API key')).toHaveAttribute('placeholder', 'Stored. Leave empty to keep it.');
  await panel.getByTestId('settings-test').click();
  await expect(panel.getByRole('status')).toHaveText('Connected. The model replied: OK');

  await panel.setViewportSize({ width: 400, height: 640 });
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await panel.screenshot({ path: 'tests/e2e/screenshots/settings.png' });
  const stored = await send<{ hasKey: boolean }>(panel, 'settings/get', {});
  expect(stored.data).toEqual({ baseUrl: mockLlm.url, model: 'mock-model', embeddingModel: '', hasKey: true });
});

test('answer a queued question and keep it as a concept card', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await askLater(page, '#intro', 'token');

  await panel.getByTestId('tab-queue').click();
  await panel.getByTestId('queue-answer-btn').click();
  await expect(panel.getByTestId('queue-answer')).toHaveText('Mock answer to: What is token?');

  await panel.getByTestId('queue-keep').click();
  await expect(panel.getByTestId('keep-hint')).toHaveText('Worth keeping. Keep the structure and the why, not a literal definition.');
  await panel.getByRole('radio', { name: 'Why does What is token work?' }).check();
  await panel.setViewportSize({ width: 400, height: 720 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/keep.png' });
  await panel.getByTestId('keep-confirm').click();

  await expect(panel.getByTestId('queue-empty')).toBeVisible();
  await panel.getByTestId('tab-cards').click();
  await expect(panel.getByTestId('card-title')).toHaveText('Why does What is token work?');
  await expect(panel.getByTestId('card-summary')).toHaveText('Mock statement about What is token?');
});

test('instance and curiosity suggestions take their own forms', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${ZH}`);
  await configureModel(panel, mockLlm.url);
  await askLater(page, '#example', 'InternVL3.5', 'InternVL3.5 是什么？');
  await askLater(page, '#example', '名字由来', '名字由来是什么？');
  await panel.getByTestId('tab-queue').click();
  for (const btn of await panel.getByTestId('queue-answer-btn').all()) await btn.click();
  await expect(panel.getByTestId('queue-answer')).toHaveCount(2);

  // Newest first: the curiosity question.
  await panel.getByTestId('queue-keep').first().click();
  await expect(panel.getByTestId('keep-hint')).toHaveText('One-off curiosity. Suggest not keeping it.');
  await panel.getByTestId('keep-skip').click();
  await expect(panel.getByTestId('inbox-item')).toHaveCount(1); // still recoverable for 7 days

  await panel.getByTestId('queue-keep').click();
  await expect(panel.getByTestId('keep-hint')).toHaveText('This is an example of "VLM". Keep just that relation.');
  await expect(panel.getByTestId('keep-concept')).toHaveValue('VLM');
  await panel.getByTestId('keep-confirm').click();

  const { data: nodes } = await send<NodeView[]>(panel, 'nodes/list', {});
  const kept = nodes.find((n) => n.title === 'Which concept is InternVL3.5 an example of?')!;
  expect(kept).toMatchObject({ type: 'knowledge', mastery: 'index', summary: 'InternVL3.5 is an example of a VLM.' });
  expect(nodes.find((n) => n.type === 'topic')).toMatchObject({ title: 'VLM' });
  const exported = JSON.parse((await send<string>(panel, 'data/exportJson', {})).data) as { edges: { kind: string; to: string }[] };
  expect(exported.edges).toMatchObject([{ kind: 'instance_of', to: kept.id }]);
});

test('captured knowledge is distilled; failures keep the raw text and can be retried', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url, 'wrong-key');
  await selectBetween(page, '#outro', '#outro');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(panel.getByTestId('card-error')).toContainText('Distilling failed: HTTP 401: Invalid API key');
  await expect(panel.locator('pre.body')).toHaveText('In short: attention is a learned, content-based lookup.');

  await configureModel(panel, mockLlm.url);
  await panel.getByTestId('card-retry').click();
  await expect(panel.getByTestId('card-summary')).toHaveText('Distilled: In short: attention is a learned, content-based lookup.');
  await panel.getByRole('textbox', { name: 'Or write your own question' }).fill('What is attention, in one line?');
  // Any data change refreshes the panel; the typed title must survive it.
  await send(panel, 'nodes/setMastery', { id: (await send<NodeView[]>(panel, 'nodes/list', {})).data[0]!.id, mastery: null });
  await panel.getByTestId('card-confirm').click();
  await expect(panel.getByTestId('card-title')).toHaveText('What is attention, in one line?');
  await expect(panel.getByTestId('title-picker')).toHaveCount(0);
});

test('the API key never reaches the database, the oplog or exports', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const { page, panel } = await openPageAndPanel(context, extensionId, `${fixtureServer}/${EN}`);
  await configureModel(panel, mockLlm.url);
  await askLater(page, '#intro', 'token');
  await send(panel, 'ask/answer', { questionId: (await send<NodeView[]>(panel, 'nodes/list', {})).data[0]!.id });
  await selectBetween(page, '#intro', '#intro');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByTestId('card-summary')).toBeVisible();

  const dump = await panel.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('chat2know');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const out: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      out[name] = await new Promise((resolve) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
      });
    }
    return JSON.stringify(out);
  });
  expect(dump).toContain('Mock answer');
  expect(dump).not.toContain('test-key');
  expect((await send<string>(panel, 'data/exportJson', {})).data).not.toContain('test-key');
  expect((await send<string>(panel, 'data/exportMarkdown', {})).data).not.toContain('test-key');
  // Every model request was authorized with the key, which only the background holds.
  expect(mockLlm.requests.every((r) => r.authorization === 'Bearer test-key' || r.authorization === 'Bearer wrong-key')).toBe(true);
});
