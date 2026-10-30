import { describe, expect, it } from 'vitest';
import { captureRange } from '@/src/capture/selection';

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
