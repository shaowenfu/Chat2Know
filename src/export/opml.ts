import type { MapTree } from '@/src/graph/tree';
import { itemText, structureTitle, visible, type ExportOptions } from './markdown';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

/** The maps as an OPML outline for mind-map and outliner apps. */
export function mapToOpml(subjects: MapTree[], o: ExportOptions, exportedAt: Date): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>Chat2Know</title><dateCreated>${exportedAt.toUTCString()}</dateCreated></head>`,
    '  <body>',
  ];
  const walk = (t: MapTree, indent: string) => {
    const text = xml(t.node.kind === 'item' ? itemText(t.node) : structureTitle(t.node, o));
    if (!t.children.length) {
      lines.push(`${indent}<outline text="${text}"/>`);
      return;
    }
    lines.push(`${indent}<outline text="${text}">`);
    t.children.forEach((c) => walk(c, `${indent}  `));
    lines.push(`${indent}</outline>`);
  };
  visible(subjects, o).forEach((t) => walk(t, '    '));
  lines.push('  </body>', '</opml>');
  return `${lines.join('\n')}\n`;
}
