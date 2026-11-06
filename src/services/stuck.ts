import type { Repository } from '@/src/db/repository';
import type { StuckCheck, StuckKind } from '@/src/db/types';
import type { LlmClient } from '@/src/llm/client';
import { parseStuck, stuckPrompt, type PromptLang } from '@/src/llm/prompts';
import { sections } from './placement';

/**
 * Is the learner stuck? Every 5 new questions in a map, the model reads that map's
 * latest 30 questions in order (with their conversations) and says whether they
 * are circling, stuck behind an earlier topic, asking off target or struggling to
 * phrase the question. When they are, the side panel shows one gentle card and the
 * topic it names is marked orange. "不用" puts the card away and keeps the map quiet
 * for the rest of the day. Nothing is scored.
 */

export const CHECK_EVERY = 5;
export const CHECK_WINDOW = 30;
const SEP = ' › ';

type Client = Pick<LlmClient, 'json'>;

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Whether the map has had 5 new questions since its last check. */
export async function checkDue(repo: Repository, mapId: string): Promise<boolean> {
  const last = (await repo.stuckChecks(mapId))[0];
  return (await repo.mapAsks(mapId, last?.throughSentAt ?? 0)).length >= CHECK_EVERY;
}

/** Reads the map's latest questions with the model and keeps what it saw. */
export async function checkStuck(repo: Repository, client: Client, mapId: string, lang: PromptLang, now: number): Promise<StuckCheck> {
  const map = await repo.node(mapId);
  const asks = (await repo.mapAsks(mapId)).slice(-CHECK_WINDOW);
  if (!asks.length) throw new Error(`Map ${mapId} has no questions to check`);
  const topics = await sections(repo, mapId);
  const reply = await client.json(
    stuckPrompt({
      lang,
      map: map.title,
      asks: asks.map((a) => ({ text: a.text, conversation: a.conversationUrl, window: a.via === 'window' })),
      sections: topics.map((t) => t.path.join(SEP)),
    }),
    (v) => parseStuck(v, asks.length, topics.length),
  );
  const base = { mapId, checkedAt: now, throughSentAt: asks.at(-1)!.sentAt, askIds: asks.map((a) => a.id) };
  if (!reply.stuck) return repo.addStuckCheck({ ...base, stuck: false });
  return repo.addStuckCheck({
    ...base,
    stuck: true,
    kind: reply.kind,
    ...(reply.section >= 0 ? { sectionId: topics[reply.section]!.node.id } : {}),
    explanation: reply.explanation,
    betterQuestion: reply.question,
    evidenceAskIds: reply.evidence.map((i) => asks[i]!.id),
  });
}

export interface StuckCard {
  checkId: string;
  kind: StuckKind;
  path: string[]; // the topic it names, below the map; empty when none
  explanation: string;
  betterQuestion: string;
  asks: string[]; // the questions that show it, oldest first
}

export interface StuckView {
  marks: string[]; // sections outlined orange
  card?: StuckCard;
}

/** What the side panel shows for a map now: the latest check, if it saw the learner stuck and was not put away. */
export async function stuckView(repo: Repository, mapId: string, now: number): Promise<StuckView> {
  const checks = await repo.stuckChecks(mapId);
  const latest = checks[0];
  // "不用" today keeps this map quiet until tomorrow.
  if (!latest?.stuck || latest.dismissedAt !== undefined || checks.some((c) => c.dismissedAt !== undefined && sameDay(c.dismissedAt, now))) return { marks: [] };
  const section = latest.sectionId ? await repo.find(latest.sectionId) : undefined;
  const live = section && !section.deletedAt && section.subjectId === mapId ? section : undefined;
  const byId = new Map((await repo.mapAsks(mapId)).map((a) => [a.id, a.text]));
  return {
    marks: live ? [live.id] : [],
    card: {
      checkId: latest.id,
      kind: latest.kind!,
      path: live ? (await repo.pathOf(live.id)).slice(1).map((n) => n.title) : [],
      explanation: latest.explanation!,
      betterQuestion: latest.betterQuestion!,
      asks: (latest.evidenceAskIds ?? []).flatMap((id) => byId.get(id) ?? []),
    },
  };
}
