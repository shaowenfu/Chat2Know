import type { NodeView } from '@/src/db/types';
import { buildTree, type TreeNode } from '@/src/graph/tree';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

/** The card tree as an OPML outline (mind-map and outliner apps): question titles, statements as notes. */
export function nodesToOpml(nodes: NodeView[], exportedAt: Date): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>Chat2Know</title><dateCreated>${exportedAt.toUTCString()}</dateCreated></head>`,
    '  <body>',
  ];
  const walk = (items: TreeNode[], indent: string) => {
    for (const { node: n, children } of items) {
      const attrs = `text="${xml(n.title || 'Untitled')}"${n.summary ? ` _note="${xml(n.summary)}"` : ''}`;
      if (!children.length) {
        lines.push(`${indent}<outline ${attrs}/>`);
        continue;
      }
      lines.push(`${indent}<outline ${attrs}>`);
      walk(children, `${indent}  `);
      lines.push(`${indent}</outline>`);
    }
  };
  walk(buildTree(nodes), '    ');
  lines.push('  </body>', '</opml>');
  return `${lines.join('\n')}\n`;
}
