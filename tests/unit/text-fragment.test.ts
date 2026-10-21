import { describe, expect, it } from 'vitest';
import { textFragmentUrl } from '@/src/capture/text-fragment';

const q = (exact: string) => ({ exact, prefix: '', suffix: '' });

describe('textFragmentUrl', () => {
  it('uses the full quote when short', () => {
    expect(textFragmentUrl('https://a.dev/p', q('hello world'))).toBe('https://a.dev/p#:~:text=hello%20world');
  });

  it('uses start,end for long quotes', () => {
    const exact = 'one two three four five six seven eight nine ten';
    expect(textFragmentUrl('https://a.dev/p', q(exact))).toBe(
      'https://a.dev/p#:~:text=one%20two%20three%20four,seven%20eight%20nine%20ten',
    );
  });

  it('escapes dashes and commas, keeps an existing hash, replaces an old fragment', () => {
    expect(textFragmentUrl('https://a.dev/p#sec', q('a-b, c'))).toBe('https://a.dev/p#sec:~:text=a%2Db%2C%20c');
    expect(textFragmentUrl('https://a.dev/p#:~:text=old', q('new'))).toBe('https://a.dev/p#:~:text=new');
  });
});
