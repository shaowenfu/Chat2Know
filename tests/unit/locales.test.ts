import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Minimal reader for our flat/nested key YAML: collects dotted key paths.
function keys(file: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^(\s*)([\w-]+):(.*)$/.exec(line);
    if (!m) continue;
    const depth = m[1]!.length / 2;
    stack.length = depth;
    stack.push(m[2]!);
    if (m[3]!.trim() !== '') out.push(stack.join('.'));
  }
  return out.sort();
}

const dir = join(__dirname, '../../locales');
const base = keys(join(dir, 'en.yml'));

describe('locales', () => {
  for (const file of readdirSync(dir).filter((f) => f !== 'en.yml')) {
    it(`${file} has exactly the same keys as en.yml`, () => {
      expect(keys(join(dir, file))).toEqual(base);
    });
  }
});
