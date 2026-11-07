import type { Repository } from '@/src/db/repository';
import type { Ask, Report } from '@/src/db/types';
import { itemCount, type MapTree } from '@/src/graph/tree';
import type { LlmClient } from '@/src/llm/client';
import { parseReport, reportPrompt, type PromptLang } from '@/src/llm/prompts';
import { SITES } from '@/src/capture/sites';

/**
 * The written report on one map's questions (artboard 16): generated only when the
 * user asks, from the map's questions (the latest 200), its outline and what the
 * stuck checks noticed. Kept, with the earlier ones as history. No scores.
 */

export const REPORT_ASKS = 200;
const SEP = ' › ';

type Client = Pick<LlmClient, 'chat'>;

const pad = (n: number) => String(n).padStart(2, '0');
const day = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const minute = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Where a question was asked: the site's name, or the floating window. */
export const askPlace = (a: Pick<Ask, 'site' | 'via'>, windowLabel: string) =>
  a.via === 'window' ? windowLabel : (SITES.find((s) => s.id === a.site)?.name ?? a.site);

/** "chapter › topic (n)" for every section below the map, in order; the 待归位 group is left out. */
function outlineLines(tree: MapTree, unit: (n: number) => string): string[] {
  const out: string[] = [];
  const walk = (t: MapTree, path: string[]) => {
    for (const c of t.children) {
      if (c.node.kind !== 'section' || c.node.role) continue;
      const p = [...path, c.node.title];
      out.push(`${p.join(SEP)} (${unit(itemCount(c))})`);
      walk(c, p);
    }
  };
  walk(tree, []);
  return out;
}

export interface ReportLabels {
  window: string; // "浮窗"
  notes: (n: number) => string; // "3 条笔记"
}

export async function generateReport(repo: Repository, client: Client, mapId: string, lang: PromptLang, labels: ReportLabels, now: number): Promise<Report> {
  const tree = await repo.subjectTree(mapId);
  const asks = (await repo.mapAsks(mapId)).slice(-REPORT_ASKS);
  if (!asks.length) throw new Error(`Map ${mapId} has no questions to report on`);
  const byId = new Map((await repo.subjectNodes(mapId)).map((n) => [n.id, n]));
  const stuck = (await repo.stuckChecks(mapId))
    .filter((c) => c.stuck)
    .reverse()
    .slice(-5)
    .map((c) => ({ when: minute(c.checkedAt), kind: c.kind!, topic: c.sectionId && !byId.get(c.sectionId)?.deletedAt ? (byId.get(c.sectionId)?.title ?? '') : '' }));
  const reply = await client.chat(
    reportPrompt({
      lang,
      map: tree.node.title,
      today: day(now),
      outline: outlineLines(tree, labels.notes),
      asks: asks.map((a) => ({ when: minute(a.sentAt), where: askPlace(a, labels.window), text: a.text, conversation: a.conversationUrl })),
      stuck,
    }),
  );
  return repo.addReport({ mapId, createdAt: now, markdown: parseReport(reply), askCount: asks.length });
}
