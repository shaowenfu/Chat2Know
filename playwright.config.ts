import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // one persistent browser context per test file; keep them serial
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
});
