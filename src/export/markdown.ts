import type { NodeView } from '@/src/db/types';
import { buildTree, type TreeNode } from '@/src/graph/tree';

const TYPE_LABEL: Record<NodeView['type'], string> = {
  topic: 'Topic',
  knowledge: 'Knowledge',
  insight: 'Insight',
  idea: 'Idea',
  question: 'Question',
};

/** One Markdown document with every live node in tree order: a card's heading is one level below its parent's. */
export function nodesToMarkdown(nodes: NodeView[], exportedAt: Date): string {
  const parts = [`# Chat2Know export`, '', `Exported ${exportedAt.toISOString()} · ${nodes.length} cards`];
  const walk = (items: TreeNode[], depth: number) => {
    for (const { node: n, children } of items) {
      const heading = '#'.repeat(Math.min(2 + depth, 6));
      parts.push('', '---', '', `${heading} ${n.title || 'Untitled'}`, '', `*${TYPE_LABEL[n.type]}* · ${new Date(n.createdAt).toISOString().slice(0, 10)}`);
      if (n.summary) parts.push('', `> ${n.summary}`);
      if (n.body) parts.push('', n.body);
      for (const s of n.sources) parts.push('', `Source: [${(s.pageTitle || s.url).replace(/[[\]]/g, '')}](${s.url})`);
      walk(children, depth + 1);
    }
  };
  walk(buildTree(nodes), 0);
  return `${parts.join('\n')}\n`;
}
