// @vitest-environment jsdom
// DOMPurify needs a standards-complete DOM: happy-dom keeps event attributes and drops headings.
import { describe, expect, it } from 'vitest';
import { reportHtml } from '@/src/ui/report-html';

describe('the report as the page shows it', () => {
  it('keeps formatting, typesets formulas and opens http(s) links in a new tab', () => {
    const html = reportHtml('## 概况\n\n你问了 **3 个**问题，像 $a_i * b_i$ 和\n\n$$\\sum_i a_i$$\n\n- [维基](https://example.org/x)\n- `code`');
    expect(html).toContain('<h2>概况</h2>');
    expect(html).toContain('<strong>3 个</strong>');
    expect(html).toContain('<a href="https://example.org/x" target="_blank" rel="noopener noreferrer">维基</a>');
    expect(html).toContain('<code>code</code>');
    // The underscores and asterisk inside the formula are TeX, not emphasis.
    expect(html).not.toContain('<em>');
    expect(html.match(/class="katex"/g)).toHaveLength(2);
    expect(html).toContain('katex-display');
  });

  it('drops scripts, event attributes, styles, images, frames, forms and javascript: links', () => {
    const html = reportHtml(
      [
        '<script>alert(1)</script>',
        '<p onclick="alert(2)" style="color:red">text</p>',
        '<img src="x" onerror="alert(3)">',
        '<iframe src="https://evil.test"></iframe>',
        '<form action="https://evil.test"><input name="k"></form>',
        '[click](javascript:alert(4))',
        '<a href="data:text/html,hi">data</a>',
        '<svg><script>alert(5)</script></svg>',
        '<style>body{display:none}</style>',
      ].join('\n\n'),
    );
    for (const bad of ['<script', 'onclick', 'onerror', 'style', '<img', '<iframe', '<form', '<input', 'javascript:', 'data:', '<svg', 'alert']) expect(html).not.toContain(bad);
    expect(html).toContain('<p>text</p>');
    expect(html).toContain('<a>click</a>');
  });

  it('typesets \\(…\\) and \\[…\\] too', () => {
    const html = reportHtml('Inline \\(a_i\\) and\n\n\\[\\sum_i a_i\\]');
    expect(html.match(/class="katex"/g)).toHaveLength(2);
    expect(html).toContain('katex-display');
    expect(html).not.toContain('\\(');
  });
});
