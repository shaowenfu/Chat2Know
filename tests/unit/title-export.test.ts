import { describe, expect, it } from 'vitest';
import { titleFromMarkdown } from '@/src/db/title';
import { mapToMarkdown } from '@/src/export/markdown';
import { mapToOpml } from '@/src/export/opml';
import { buildTree } from '@/src/graph/tree';
import type { MapNode } from '@/src/db/types';

describe('titleFromMarkdown', () => {
  it('uses the first meaningful line without Markdown syntax', () => {
    expect(titleFromMarkdown('\n## **Self-attention** basics\n\nbody')).toBe('Self-attention basics');
    expect(titleFromMarkdown('- [link text](https://x)')).toBe('link text');
    expect(titleFromMarkdown('```python\nprint(1)\n```')).toBe('print(1)');
    expect(titleFromMarkdown('| a | b |\n| --- | --- |')).toBe('a b');
    expect(titleFromMarkdown('For queries $Q$ and $$x^2$$')).toBe('For queries Q and x^2');
  });

  it('truncates long titles', () => {
    const t = titleFromMarkdown('word '.repeat(40));
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith('…')).toBe(true);
  });
});

const at = { createdAt: 0, updatedAt: 'x' };
const n = (id: string, kind: MapNode['kind'], parentId: string | undefined, order: string, title: string, extra: Partial<MapNode> = {}): MapNode => ({
  id,
  subjectId: 's',
  kind,
  ...(parentId ? { parentId } : {}),
  order,
  title,
  origin: 'user',
  ...at,
  ...extra,
});
const [map] = buildTree([
  n('s', 'subject', undefined, 'a0', '线性代数'),
  n('m', 'section', 's', 'a0', '矩阵'),
  n('t', 'section', 'm', 'a0', '转置 & "T"'),
  n('f', 'item', 't', 'a0', '', { itemType: 'formula', latex: '(AB)^T = B^T A^T', source: { url: 'https://chatgpt.com/c/1', pageTitle: '', quoteExact: '', quotePrefix: '', quoteSuffix: '', capturedAt: 0 } }),
  n('g', 'section', 's', 'a1', '特征值', { origin: 'outline' }),
  n('u', 'section', 's', 'a2', '', { role: 'unplaced' }),
  n('x', 'item', 'u', 'a0', '可逆当且仅当 det A ≠ 0', { itemType: 'statement' }),
]);
const opts = { unplacedTitle: '待归位' };

describe('map exports', () => {
  it('Markdown has a heading per structure node and a bullet per item, grey nodes left out', () => {
    expect(mapToMarkdown([map!], opts)).toBe(
      '# 线性代数\n\n## 矩阵\n\n### 转置 & "T"\n\n- $(AB)^T = B^T A^T$ ([source](https://chatgpt.com/c/1))\n\n## 待归位\n\n- 可逆当且仅当 det A ≠ 0\n',
    );
    expect(mapToMarkdown([map!], { ...opts, includeGrey: true })).toContain('## 特征值');
  });

  it('OPML keeps the tree, escaped', () => {
    const opml = mapToOpml([map!], opts, new Date(0));
    expect(opml).toContain(
      '    <outline text="线性代数">\n      <outline text="矩阵">\n        <outline text="转置 &amp; &quot;T&quot;">\n          <outline text="$(AB)^T = B^T A^T$"/>',
    );
    expect(opml).not.toContain('特征值');
  });
});
