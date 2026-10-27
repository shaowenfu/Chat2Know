import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/eval/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
