// @vitest-environment jsdom
// DOMPurify needs a standards-complete DOM: happy-dom keeps event attributes and drops headings.
import { describe, expect, it } from 'vitest';
import { reportHtml } from '@/src/ui/report-html';
import { itemHtml } from '@/src/ui/math';

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

describe('a note as the map shows it', () => {
  const statement = (title: string) => itemHtml({ itemType: 'statement', title });

  it('keeps a table with its formulas, line breaks and a displayed formula', () => {
    const html = itemHtml({
      itemType: 'quote',
      title: '### 方法二：套公式\n\n| 函数 | Hessian |\n| --- | --- |\n| $a^\\top x + b$ | $O$ |\n| $\\|x\\|^2$ | $2I$ |\n\n**适用**：二次函数\n注意常数矩阵\n\n$$\\nabla^2 f = H^\\top H$$',
    });
    expect(html).toContain('<h3>方法二：套公式</h3>');
    expect(html).toContain('<table>');
    expect(html.match(/<td>/g)).toHaveLength(4);
    expect(html.match(/class="katex"/g)).toHaveLength(5);
    expect(html).toContain('katex-display');
    expect(html).toContain('<strong>适用</strong>：二次函数<br>注意常数矩阵');
  });

  it('keeps a page\'s https and inline images, nothing else that could run or track', () => {
    expect(statement('![图](https://cdn.example.org/a.png)')).toContain('<img src="https://cdn.example.org/a.png" alt="图" loading="lazy" referrerpolicy="no-referrer">');
    expect(statement('![x](data:image/png;base64,iVBORw0KGgo=)')).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
    for (const bad of ['![x](http://plain.example.org/a.png)', '![x](data:image/svg+xml;base64,PHN2Zz4=)', '<img src="https://x.org/a.png" onerror="alert(1)">']) {
      const html = statement(bad);
      expect(html).not.toMatch(/onerror|http:\/\/plain|svg\+xml/);
    }
    expect(statement('[a](data:image/png;base64,iVBO)').trim()).toBe('<p><a>a</a></p>');
    expect(statement('[a](https://example.org)')).toContain('href="https://example.org" target="_blank"');
  });

  it('a report never shows images', () => {
    expect(reportHtml('![x](https://cdn.example.org/a.png)')).not.toContain('<img');
  });
});

