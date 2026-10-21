import type { NodeView } from '@/src/db/types';

const TYPE_LABEL: Record<NodeView['type'], string> = {
  topic: 'Topic',
  knowledge: 'Knowledge',
  insight: 'Insight',
  idea: 'Idea',
  question: 'Question',
};

/** One Markdown document with every live node, newest first. */
export function nodesToMarkdown(nodes: NodeView[], exportedAt: Date): string {
  const parts = [`# Chat2Know export`, '', `Exported ${exportedAt.toISOString()} · ${nodes.length} cards`];
  for (const n of nodes) {
    parts.push('', '---', '', `## ${n.title || 'Untitled'}`, '', `*${TYPE_LABEL[n.type]}* · ${new Date(n.createdAt).toISOString().slice(0, 10)}`);
    if (n.summary) parts.push('', `> ${n.summary}`);
    if (n.body) parts.push('', n.body);
    for (const s of n.sources) parts.push('', `Source: [${(s.pageTitle || s.url).replace(/[[\]]/g, '')}](${s.url})`);
  }
  return `${parts.join('\n')}\n`;
}
