import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Saved web pages are committed as fixtures; they must never carry session tokens,
 * API keys, account ids or email addresses. Fix a failure with:
 *   CHAT2KNOW_REDACT='your name|your handle' npm run sanitize -- <files>
 */
const root = join(__dirname, '../fixtures');
const files = ['pages', 'sites'].flatMap((dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.html'))
    .map((f) => join(root, dir, f)),
);

describe('fixtures contain no secrets', () => {
  it('every saved page passes the sanitizer check', () => {
    expect(files.length).toBeGreaterThan(0);
    let output = '';
    try {
      execFileSync('node', [join(__dirname, '../../scripts/sanitize-pages.mjs'), '--check', ...files], { encoding: 'utf8' });
    } catch (err) {
      output = (err as { stdout?: string }).stdout ?? String(err);
    }
    expect(output).toBe('');
  });
});
