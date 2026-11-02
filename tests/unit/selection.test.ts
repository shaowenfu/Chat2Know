import { describe, expect, it } from 'vitest';
import { captureRange, plainWords } from '@/src/capture/selection';

describe('captureRange', () => {
  it('keeps a code block language that lives in a header outside the selection', () => {
    document.body.innerHTML =
      '<div class="block"><div class="banner"><span>python</span><span>Copy</span></div><pre id="code">print(1)</pre></div>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('code')!.firstChild!);
    expect(captureRange(range, document, 'https://x.dev')!.markdown).toBe('```python\nprint(1)\n```');
  });

  it('widens a selection inside a formula wrapper to the whole formula', () => {
    document.body.innerHTML =
      '<p>Value <span class="math-inline" data-math="x^2"><span class="katex"><span class="katex-html"><span id="inner">x</span><span>2</span></span></span></span> end</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('inner')!);
    expect(captureRange(range, document, 'https://x.dev')!.markdown).toBe('$x^2$');
  });
});

describe('the words of a protected quote', () => {
  it('are the text as shown, with line breaks kept and stray spacing collapsed', () => {
    expect(plainWords('  Stay\u00a0 hungry.  \n\n\n\t Stay foolish. ')).toBe('Stay hungry.\n\nStay foolish.');
  });

  it('keep a formula as its LaTeX, not the doubled rendered text', () => {
    document.body.innerHTML = '<p id="p">Euler: <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">e^{i\\pi}+1=0</annotation></semantics></math></span><span class="katex-html">eiπ+1=0</span></span></p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    expect(captureRange(range, document, 'https://x.dev', 'Euler: eiπ+1=0eiπ+1=0')!.words).toBe('Euler: $e^{i\\pi}+1=0$');
  });

  it('are the browser\'s text when no formula is selected', () => {
    document.body.innerHTML = '<p id="p">Less is <b>more</b>.</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    expect(captureRange(range, document, 'https://x.dev', 'Less is more.')!.words).toBe('Less is more.');
  });
});
