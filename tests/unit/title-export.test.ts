import { describe, expect, it } from 'vitest';
import { titleFromMarkdown } from '@/src/db/title';
import { nodesToMarkdown } from '@/src/export/markdown';
import { nodesToOpml } from '@/src/export/opml';
import { nodesToAnki } from '@/src/export/anki';
import type { NodeView } from '@/src/db/types';

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
          askCount: 0,
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

const node = (id: string, title: string, extra: Partial<NodeView> = {}): NodeView => ({
  id,
  type: 'knowledge',
  title,
  status: 'confirmed',
  askCount: 0,
  createdAt: Date.UTC(2026, 9, 21),
  updatedAt: 'x',
  sources: [],
  ...extra,
});
const branch = [
  node('1', 'What does attention do?', { summary: 'Mixes values by "similarity" & weight.', mastery: 'internalize' }),
  node('2', 'Why scale?', { summary: 'Avoids saturation.', parent: { id: '1', kind: 'child', order: 'a0' } }),
  node('3', 'Draft', { status: 'draft', summary: 'not kept yet' }),
];

describe('tree exports', () => {
  it('Markdown nests a child one heading level below its parent', () => {
    const md = nodesToMarkdown(branch, new Date(0));
    expect(md).toContain('## What does attention do?');
    expect(md).toContain('### Why scale?');
    expect(md.indexOf('### Why scale?')).toBeGreaterThan(md.indexOf('## What does attention do?'));
  });

  it('OPML keeps the tree, with statements as notes, escaped', () => {
    const opml = nodesToOpml(branch, new Date(0));
    expect(opml).toContain('<outline text="What does attention do?" _note="Mixes values by &quot;similarity&quot; &amp; weight.">\n      <outline text="Why scale?" _note="Avoids saturation."/>\n    </outline>');
    expect(opml).toContain('<outline text="Draft" _note="not kept yet"/>');
  });

  it('Anki CSV has kept cards with a statement, quoted, tagged with the mastery', () => {
    expect(nodesToAnki(branch)).toBe(
      '#separator:Comma\n#html:false\n#tags column:3\n' +
        '"What does attention do?","Mixes values by ""similarity"" & weight.","chat2know mastery::internalize"\n' +
        '"Why scale?","Avoids saturation.","chat2know"\n',
    );
  });
});
