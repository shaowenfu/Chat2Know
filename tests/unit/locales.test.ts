import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Messages = { [key: string]: string | Messages };

/** Dotted key paths of a locale file; every leaf must be a string (YAML once turned `no:` into `false`). */
function keys(file: string): string[] {
  const out: string[] = [];
  const walk = (o: Messages, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') out.push(prefix + k);
      else if (typeof v === 'object' && v !== null) walk(v, `${prefix}${k}.`);
      else throw new Error(`${file}: ${prefix}${k} is not a string`);
    }
  };
  walk(JSON.parse(readFileSync(file, 'utf8')) as Messages, '');
  return out.sort();
}

const dir = join(__dirname, '../../locales');
const base = keys(join(dir, 'en.json'));

describe('locales', () => {
  for (const file of readdirSync(dir).filter((f) => f !== 'en.json')) {
    it(`${file} has exactly the same keys as en.json`, () => {
      expect(keys(join(dir, file))).toEqual(base);
    });
  }

  it('keeps every $n of a message in its translation', () => {
    const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as Messages;
    const zh = JSON.parse(readFileSync(join(dir, 'zh_CN.json'), 'utf8')) as Messages;
    const get = (o: Messages, k: string) => k.split('.').reduce<string | Messages>((n, p) => (n as Messages)[p]!, o) as string;
    for (const k of base) expect([k, [...get(zh, k).matchAll(/\$\d/g)].length]).toEqual([k, [...get(en, k).matchAll(/\$\d/g)].length]);
  });
});
