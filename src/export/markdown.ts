import { isGrey, type MapTree } from '@/src/graph/tree';
import type { MapNode } from '@/src/db/types';

export interface ExportOptions {
  /** The "待归位" group's title in the user's language. */
  unplacedTitle: string;
  /** Grey (not yet learned) outline nodes are left out unless asked for. */
  includeGrey?: boolean;
}

export const structureTitle = (n: MapNode, o: ExportOptions) => (n.role === 'unplaced' ? o.unplacedTitle : n.title);

/** Keeps the trees' structure, without grey nodes unless asked for. */
export function visible(trees: MapTree[], o: ExportOptions): MapTree[] {
  return trees.filter((t) => o.includeGrey || !isGrey(t)).map((t) => ({ node: t.node, children: visible(t.children, o) }));
}

export const itemText = (n: MapNode) => [n.latex === undefined ? '' : `$${n.latex}$`, n.title].filter(Boolean).join(' — ');

/** One Markdown document: a heading per structure node, one bullet per item with a link to its source. */
export function mapToMarkdown(subjects: MapTree[], o: ExportOptions): string {
  const parts: string[] = [];
  const walk = (t: MapTree, depth: number) => {
    const n = t.node;
    if (n.kind === 'item') {
      parts.push(`- ${itemText(n)}${n.source ? ` ([source](${n.source.url}))` : ''}`);
      return;
    }
    parts.push('', `${'#'.repeat(Math.min(depth, 6))} ${structureTitle(n, o)}`, '');
    t.children.forEach((c) => walk(c, depth + 1));
  };
  visible(subjects, o).forEach((t) => walk(t, 1));
  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
