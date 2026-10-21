import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';

const EXTENSION_PATH = resolve('.output/chrome-mv3-e2e');
const PAGES_DIR = resolve('tests/fixtures/pages');

// Use the pre-installed Chromium when present (cloud container), else Playwright's own.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export const test = base.extend<
  { context: BrowserContext; serviceWorker: Worker; extensionId: string },
  { fixtureServer: string }
>({
  fixtureServer: [
    async ({}, use) => {
      const server: Server = createServer(async (req, res) => {
        try {
          const name = (req.url ?? '/').split('?')[0]!.replace(/^\/+/, '') || 'basic.html';
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
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      executablePath,
      channel: 'chromium', // new headless mode, which supports extensions
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
