import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayFormulas } from '@/src/capture/formulas';

const pages = join(__dirname, '../fixtures/pages');
const expected = join(__dirname, '../fixtures/expected');

/** The display formulas of a converted page: its $$ blocks. */
const blocks = (md: string) => [...md.matchAll(/^\$\$\n([\s\S]*?)\n\$\$$/gm)].map((m) => m[1]);

describe('display formulas on the saved pages', () => {
  for (const file of readdirSync(pages).filter((f) => f.endsWith('.html'))) {
    it(`finds the same LaTeX as the converter in ${file}`, () => {
      const doc = new DOMParser().parseFromString(readFileSync(join(pages, file), 'utf8'), 'text/html');
      const md = readFileSync(join(expected, file.replace(/\.html$/, '.md')), 'utf8');
      expect(displayFormulas(doc.body).map((f) => f.latex)).toEqual(blocks(md));
    });
  }

  it('skips inline formulas and formulas in the input box', () => {
    const doc = new DOMParser().parseFromString(
      '<p>inline <span class="katex"><annotation encoding="application/x-tex">x</annotation></span></p>' +
        '<div contenteditable="true"><span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">y</annotation></span></span></div>' +
        '<span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">z</annotation></span></span>',
      'text/html',
    );
    expect(displayFormulas(doc.body).map((f) => f.latex)).toEqual(['z']);
  });
});
