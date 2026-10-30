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

  // Markup below is copied from real pages saved on 2026-10-30.
  it('reads LaTeX from a data-math wrapper whose KaTeX annotation is empty (Gemini)', () => {
    const html =
      '<td><span class="math-inline" data-math="(0, 1)"><span class="katex"><span class="katex-mathml"></span><span class="katex-html" aria-hidden="true"><span class="mopen">(</span><span class="mord">0</span></span></span></span> 之间的概率值</td>';
    expect(htmlToMarkdown(`<p>${html}</p>`)).toBe('$(0, 1)$ 之间的概率值');
  });

  it('reads LaTeX from copy-text, stripping \\( \\), even when the formula is an SVG (Doubao)', () => {
    expect(htmlToMarkdown('<p>容易溢出（<span class="container-FpXcrl math-inline" copy-text="\\(e^{大数字}\\)"><svg></svg></span> 爆炸）</p>')).toBe(
      '容易溢出（$e^{大数字}$ 爆炸）',
    );
  });

  it('reads display LaTeX from data-math-source (ChatGPT)', () => {
    const html = `<span class="Display-XTzqIm" data-math-display="true" data-math-source="e^{1000}\\rightarrow\\text{数值溢出}"><span class="katex-display">${katexInline('ignored')}</span></span>`;
    expect(htmlToMarkdown(html)).toBe('$$\ne^{1000}\\rightarrow\\text{数值溢出}\n$$');
  });

  it('converts a code block that is not a <pre>, keeping line breaks and the header language (ChatGPT)', () => {
    const block = (label: string) =>
      `<div data-code-block="true" data-markdown-copy="code-block"><div data-markdown-copy="exclude" contenteditable="false"><svg></svg><div class="min-w-0 flex-1 truncate">${label}</div><div><button>Copy</button></div></div><div><div><code class="whitespace-pre! block CodeContent-ybJ8Tl"><span>def f(x):\n    return x</span></code></div></div></div>`;
    expect(htmlToMarkdown(block('Python'))).toBe('```python\ndef f(x):\n    return x\n```');
    expect(htmlToMarkdown(block('Plain text'))).toBe('```\ndef f(x):\n    return x\n```');
  });

  it('takes the language from a header above the <pre> (DeepSeek, Gemini)', () => {
    const html =
      '<div class="md-code-block"><div class="md-code-block-banner"><span class="d813de27">python</span><div role="button"><span class="code-info-button-text">Copy</span></div><div role="button"><span class="code-info-button-text">Download</span></div></div><pre><span>import numpy as np</span>\n<span>x = 1</span></pre></div>';
    expect(htmlToMarkdown(html)).toBe('```python\nimport numpy as np\nx = 1\n```');
  });

  it('rebuilds LaTeX from KaTeX HTML when the page keeps no source (Kimi)', () => {
    const html =
      '<p>给定 <span class="katex-wrapper"><span class="katex"><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut"></span><span class="mord"><span class="mord mathnormal">z</span><span class="msupsub"><span class="vlist-t vlist-t2"><span class="vlist-r"><span class="vlist"><span><span class="pstrut"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mathnormal mtight">i</span></span></span></span><span class="vlist-s">\u200b</span></span><span class="vlist-r"><span class="vlist"><span></span></span></span></span></span></span></span></span></span></span> 为例</p>';
    expect(htmlToMarkdown(html)).toBe('给定 $z_{i}$ 为例');
  });

  it('joins a sticky table header drawn as its own table with the body table (Kimi)', () => {
    const html =
      '<div class="table" role="table"><div class="table-header"><table role="presentation"><thead><tr><th>a</th><th>b</th></tr></thead></table></div><div class="table-container"><table role="presentation"><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></div>';
    expect(htmlToMarkdown(html)).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
  });
});
