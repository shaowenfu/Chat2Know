import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '@/src/capture/markdown';

/**
 * Snapshot test over every saved page in tests/fixtures/pages.
 * Expected output lives in tests/fixtures/expected/<name>.md.
 * After reviewing a deliberate change, update with `npx vitest run -u`.
 */
const pages = join(__dirname, '../fixtures/pages');
const expected = join(__dirname, '../fixtures/expected');

describe('page fixtures', () => {
  for (const file of readdirSync(pages).filter((f) => f.endsWith('.html'))) {
    it(`converts ${file}`, async () => {
      const doc = new DOMParser().parseFromString(readFileSync(join(pages, file), 'utf8'), 'text/html');
      await expect(htmlToMarkdown(doc.body)).toMatchFileSnapshot(join(expected, file.replace(/\.html$/, '.md')));
    });
  }
});
