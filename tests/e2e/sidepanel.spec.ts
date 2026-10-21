/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';

test('extension loads and registers the side panel', async ({ serviceWorker }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.side_panel?.default_path).toBe('sidepanel.html');
  const behavior = await serviceWorker.evaluate(() => chrome.sidePanel.getPanelBehavior());
  expect(behavior.openPanelOnActionClick).toBe(true);
});

test('side panel renders and reaches the background', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Chat2Know' })).toBeVisible();
  await expect(panel.getByTestId('bg-status')).toHaveAttribute('data-status', 'connected');

  mkdirSync('tests/e2e/screenshots', { recursive: true });
  await panel.setViewportSize({ width: 400, height: 600 });
  await panel.screenshot({ path: 'tests/e2e/screenshots/sidepanel.png' });
});

test('side panel -> background -> content script round trip', async ({ context, extensionId, fixtureServer }) => {
  const page = await context.newPage();
  await page.goto(`${fixtureServer}/basic.html`);
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  const url = `${fixtureServer}/basic.html`;
  const info = await panel.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    const res = await chrome.runtime.sendMessage({ type: 'page/probe', payload: { tabId: tab!.id } });
    return res;
  }, url);

  expect(info).toEqual({
    ok: true,
    data: { url, title: 'Chat2Know fixture: basic', textLength: expect.any(Number) },
  });
  expect(info.data.textLength).toBeGreaterThan(20);

  // Probing twice must not double-register the content script listener.
  const again = await panel.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    return chrome.runtime.sendMessage({ type: 'page/probe', payload: { tabId: tab!.id } });
  }, url);
  expect(again.ok).toBe(true);
});

test('probe reports a readable error for pages it cannot access', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const res = await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.runtime.sendMessage({ type: 'page/probe', payload: { tabId: tab!.id } });
  });
  expect(res.ok).toBe(false);
  expect(typeof res.error).toBe('string');
});
