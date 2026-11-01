import type { Repository } from '@/src/db/repository';
import { itemCount, type MapTree, type OutlineNode } from '@/src/graph/tree';
import type { LlmClient } from '@/src/llm/client';
import { outlinePrompt, parseOutline } from '@/src/llm/prompts';

/** The section paths below the subject, "chapter › topic". */
function sectionPaths(t: MapTree, path: string[] = []): string[] {
  return t.children
    .filter((c) => c.node.kind === 'section' && !c.node.role)
    .flatMap((c) => [[...path, c.node.title].join(' › '), ...sectionPaths(c, [...path, c.node.title])]);
}

const hasOutline = (t: MapTree): boolean => t.node.origin === 'outline' || t.children.some(hasOutline);

/** Offered once a subject has its first item, while it has no outline yet. */
export const outlineOfferable = (t: MapTree) => itemCount(t) > 0 && !hasOutline(t);

/** One model call: the subject's standard outline, or the pasted table of contents as an outline. */
export async function proposeOutline(repo: Repository, client: Pick<LlmClient, 'json'>, subjectId: string, toc?: string): Promise<OutlineNode[]> {
  const tree = await repo.subjectTree(subjectId);
  return client.json(outlinePrompt({ subject: tree.node.title, existing: sectionPaths(tree), ...(toc?.trim() ? { toc: toc.trim() } : {}) }), parseOutline);
}
