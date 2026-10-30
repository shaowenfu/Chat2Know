import type { NodeView } from '@/src/db/types';

const field = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * Kept knowledge cards as an Anki import file: front = question title, back =
 * statement, tags = chat2know plus the mastery requirement. The header lines
 * tell Anki the separator and the tags column.
 */
export function nodesToAnki(nodes: NodeView[]): string {
  const rows = nodes
    .filter((n) => n.type === 'knowledge' && n.status !== 'draft' && n.summary)
    .map((n) => [field(n.title), field(n.summary!), field(['chat2know', ...(n.mastery ? [`mastery::${n.mastery}`] : [])].join(' '))].join(','));
  return ['#separator:Comma', '#html:false', '#tags column:3', ...rows].join('\n') + '\n';
}
