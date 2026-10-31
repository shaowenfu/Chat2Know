/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { send } from './helpers';

test('model settings: save, test connection, a wrong key surfaces the provider error, the key never reaches a page', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const save = (apiKey?: string) =>
    send(panel, 'settings/save', { baseUrl: mockLlm.url, model: 'mock-model', embeddingModel: '', ...(apiKey ? { apiKey } : {}) });

  expect((await send(panel, 'settings/test', {})).error).toBe('error.modelNotConfigured');
  await save('wrong-key');
  expect((await send(panel, 'settings/test', {})).error).toBe('HTTP 401: Invalid API key');
  await save('test-key');
  await save(); // an empty key keeps the stored one
  expect((await send<{ reply: string }>(panel, 'settings/test', {})).data.reply).toBe('OK');
  expect((await send(panel, 'settings/get', {})).data).toEqual({ baseUrl: mockLlm.url, model: 'mock-model', embeddingModel: '', hasKey: true });

  // R0: the side panel is one blank view until the map arrives.
  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await panel.setViewportSize({ width: 400, height: 640 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/sidepanel.png' });
  await expect(panel.getByTestId('panel')).toBeVisible();
});
