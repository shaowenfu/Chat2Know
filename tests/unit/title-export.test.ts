import { describe, expect, it } from 'vitest';
import { titleFromMarkdown } from '@/src/db/title';
import { nodesToMarkdown } from '@/src/export/markdown';

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

describe('nodesToMarkdown', () => {
  it('renders cards with type, body and source link', () => {
    const md = nodesToMarkdown(
      [
        {
          id: '1',
          type: 'idea',
          title: 'Spaced recall',
          body: 'Test yourself.',
          status: 'draft',
          createdAt: Date.UTC(2026, 9, 21),
          updatedAt: 'x',
          sources: [{ id: 's', nodeId: '1', url: 'https://a.dev', pageTitle: 'A [chat]', quoteExact: '', quotePrefix: '', quoteSuffix: '', capturedAt: 0 }],
        },
      ],
      new Date(Date.UTC(2026, 9, 22)),
    );
    expect(md).toBe(
      '# Chat2Know export\n\nExported 2026-10-22T00:00:00.000Z · 1 cards\n\n---\n\n## Spaced recall\n\n*Idea* · 2026-10-21\n\nTest yourself.\n\nSource: [A chat](https://a.dev)\n',
    );
  });
});
