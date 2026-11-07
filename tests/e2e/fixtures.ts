import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { startMockLlm, type MockLlm } from '../mock-llm/server';
/// <reference types="chrome" />
import { test as base, expect as baseExpect, chromium, type BrowserContext, type Worker } from '@playwright/test';

const EXTENSION_PATH = resolve('.output/chrome-mv3-e2e');
const PAGES_DIR = resolve('tests/fixtures/pages');

// Use the pre-installed Chromium when present (cloud container), else Playwright's own.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export const test = base.extend<
  { uiLang: string; context: BrowserContext; serviceWorker: Worker; extensionId: string },
  { fixtureServer: string; mockLlm: MockLlm }
>({
  mockLlm: [
    async ({}, use) => {
      const llm = await startMockLlm();
      await use(llm);
      await llm.close();
    },
    { scope: 'worker' },
  ],
  fixtureServer: [
    async ({}, use) => {
      const server: Server = createServer(async (req, res) => {
        try {
          const name = (req.url ?? '/').split('?')[0]!.replace(/^\/+/, '') || 'synthetic-chat-katex.html';
          const body = await readFile(join(PAGES_DIR, name.replace(/\.\.+/g, '')));
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
        } catch {
          res.writeHead(404).end('not found');
        }
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      server.close();
    },
    { scope: 'worker' },
  ],
  // The browser's UI language, which the extension's strings follow; `test.use({ uiLang: 'zh-CN' })` for Chinese.
  uiLang: ['en-US', { option: true }],
  context: async ({ uiLang }, use) => {
    const context = await chromium.launchPersistentContext('', {
      executablePath,
      channel: 'chromium', // new headless mode, which supports extensions
      locale: uiLang,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, `--lang=${uiLang}`],
      env: { ...process.env, LANGUAGE: uiLang.replace('-', '_') },
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    // On a cold start the worker can be reachable before extension APIs are bound.
    await baseExpect.poll(() => sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.runtime?.id)).toBe(true);
    await use(sw);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
