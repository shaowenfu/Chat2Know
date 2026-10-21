import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '@/src/capture/markdown';

const katexInline = (tex: string) =>
  `<span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="mord">x</span></span></span>`;

describe('htmlToMarkdown', () => {
  it('restores inline KaTeX to LaTeX', () => {
    expect(htmlToMarkdown(`<p>Energy ${katexInline('E=mc^2')} holds.</p>`)).toBe('Energy $E=mc^2$ holds.');
  });

  it('restores display KaTeX as a $$ block', () => {
    const html = `<p>Sum:</p><span class="katex-display">${katexInline('\\sum_{i=1}^n i')}</span><p>done</p>`;
    expect(htmlToMarkdown(html)).toBe('Sum:\n\n$$\n\\sum_{i=1}^n i\n$$\n\ndone');
  });

  it('restores MathJax 2 script tags', () => {
    expect(htmlToMarkdown('<p>a <script type="math/tex">a_1</script> b</p>')).toBe('a $a_1$ b');
    expect(htmlToMarkdown('<script type="math/tex; mode=display">x^2</script>')).toBe('$$\nx^2\n$$');
  });

  it('restores MathML with alttext', () => {
    expect(htmlToMarkdown('<p><math alttext="\\alpha"><mi>α</mi></math></p>')).toBe('$\\alpha$');
  });

  it('keeps code block language and content verbatim', () => {
    const html = '<pre><code class="language-python">def f(x):\n    return x * 2  # *not* emphasis\n</code></pre>';
    expect(htmlToMarkdown(html)).toBe('```python\ndef f(x):\n    return x * 2  # *not* emphasis\n```');
  });

  it('drops buttons such as "Copy code" inside code blocks', () => {
    const html = '<pre><div>python<button>Copy code</button></div><code class="hljs language-ts">let a = 1;</code></pre>';
    expect(htmlToMarkdown(html)).toBe('```ts\nlet a = 1;\n```');
  });

  it('uses a longer fence when code contains backticks', () => {
    expect(htmlToMarkdown('<pre><code>```inner```</code></pre>')).toBe('````\n```inner```\n````');
  });

  it('converts tables, escaping pipes and keeping inline formatting', () => {
    const html =
      '<table><thead><tr><th>Name</th><th>Formula</th></tr></thead><tbody>' +
      `<tr><td><b>Area</b></td><td>${katexInline('\\pi r^2')}</td></tr>` +
      '<tr><td>a|b</td><td></td></tr></tbody></table>';
    expect(htmlToMarkdown(html)).toBe(
      '| Name | Formula |\n| --- | --- |\n| **Area** | $\\pi r^2$ |\n| a\\|b |  |',
    );
  });

  it('pads ragged table rows', () => {
    expect(htmlToMarkdown('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>')).toBe(
      '| a | b |\n| --- | --- |\n| c |  |',
    );
  });

  it('keeps lists and links', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li><a href="https://x.dev">two</a></li></ul>')).toBe(
      '-   one\n-   [two](https://x.dev)',
    );
  });
});
