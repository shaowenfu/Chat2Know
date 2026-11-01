import type { Repository } from '@/src/db/repository';
import type { Ask, Gap, MapNode } from '@/src/db/types';
import { hasCycle } from '@/src/graph/prereq';
import { detectSignals } from '@/src/graph/signals';
import { rankRootCauses, type WeightedSymptom } from '@/src/graph/rootcause';
import type { LlmClient } from '@/src/llm/client';
import { fillPrompt, judgePrompt, parseFill, parseJudgement, parsePrereqs, parseQuiz, parseTags, prereqPrompt, quizPrompt, tagPrompt } from '@/src/llm/prompts';
import { sections } from './placement';
import { sameItem } from './record';
import { embedAsks } from './vectors';

/**
 * Gaps from the user's own questions: they are tagged onto the map's sections, the
 * three signals (repeat, downshift, circling) are read off them, and the section
 * that explains most becomes a possible gap, marked orange without a word. One gap
 * is asked about at a time, at most once a day; a "不用", a passed question or a
 * filled gap stays quiet for 30 days.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const COOL_DOWN_DAYS = 30;
export const MAX_OPEN = 3;
export const TAG_BATCH = 30;
const SEP = ' › ';

/** Kept by the background between runs. */
export interface GapState {
  lastAskedAt: number;
  /** Per subject, the sections its prerequisite edges were computed for. */
  prereqFor: Record<string, string>;
}

export const EMPTY_STATE: GapState = { lastAskedAt: 0, prereqFor: {} };

type Client = Pick<LlmClient, 'json' | 'embed'>;

const isOpen = (g: Gap) => g.status === 'suspected' || g.status === 'asked';
const quiet = (g: Gap, now: number) => isOpen(g) || (g.coolDownUntil ?? 0) > now;

/** Tags new questions, updates prerequisites and vectors, and marks the best new gap. Returns the new state. */
export async function analyze(repo: Repository, client: Client, embeddingModel: string, now: number, state: GapState): Promise<GapState> {
  const all = await sections(repo);
  if (!all.length) return state;
  const paths = all.map((s) => s.path.join(SEP));

  for (let batch = await repo.untaggedAsks(TAG_BATCH); batch.length; batch = await repo.untaggedAsks(TAG_BATCH)) {
    const tags = await client.json(tagPrompt({ asks: batch.map((a) => a.text), sections: paths }), (v) => parseTags(v, batch.length, all.length));
    await repo.tagAsks(batch.map((a, i) => ({ askId: a.id, sectionIds: tags[i]!.map((k) => all[k]!.node.id) })));
  }

  const asks = await repo.listAsks();
  if (embeddingModel) await embedAsks(repo, client, embeddingModel, asks);
  const vectored = embeddingModel ? await repo.listAsks() : asks;

  // Prerequisites per subject, again only when its sections changed.
  const next: GapState = { ...state, prereqFor: { ...state.prereqFor } };
  const tags = await repo.listAskTags();
  const tagged = new Set(tags.map((t) => t.sectionId));
  for (const subjectId of new Set(all.filter((s) => tagged.has(s.node.id)).map((s) => s.node.subjectId))) {
    const own = all.filter((s) => s.node.subjectId === subjectId);
    const signature = own.map((s) => s.node.id).sort().join(',');
    if (next.prereqFor[subjectId] === signature) continue;
    const edges = await client.json(prereqPrompt({ subject: own[0]!.path[0]!, sections: own.map((s) => s.path.slice(1).join(SEP)) }), (v) => parsePrereqs(v, own.length));
    const links = edges.map((e) => ({ from: own[e.from]!.node.id, to: own[e.to]!.node.id }));
    if (hasCycle(links)) throw new Error(`The model's prerequisites for ${own[0]!.path[0]} have a cycle`);
    await repo.setPrereqs(own.map((s) => s.node.id), links);
    next.prereqFor[subjectId] = signature;
  }

  const ids = all.map((s) => s.node.id);
  const edges = (await repo.listPrereqs()).map((e) => ({ from: e.from, to: e.to }));
  const { symptoms, circling } = detectSignals({ asks: vectored, tags: tags.map((t) => ({ askId: t.askId, conceptId: t.sectionId })), conceptIds: ids, edges, now });
  const weighted: WeightedSymptom[] = [...symptoms];
  for (const run of circling) {
    // A circling run is about the section its questions are tagged with most.
    const counts = new Map<string, number>();
    for (const t of tags) if (run.askIds.includes(t.askId)) counts.set(t.sectionId, (counts.get(t.sectionId) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!top) continue;
    const s = weighted.find((x) => x.conceptId === top);
    if (s) {
      s.circling = (s.circling ?? 0) + 1;
      s.askIds = [...new Set([...s.askIds, ...run.askIds])];
    } else weighted.push({ conceptId: top, signals: {}, askIds: run.askIds, circling: 1 });
  }

  const gaps = await repo.listGaps();
  let open = gaps.filter(isOpen).length;
  // A section already marked or resting, or whose questions such a gap already accounts for, is not marked again.
  const covered = new Set(gaps.filter((g) => quiet(g, now)).flatMap((g) => [g.sectionId, ...g.explains]));
  for (const c of rankRootCauses(weighted, ids, edges)) {
    if (open >= MAX_OPEN) break;
    if ([c.conceptId, ...c.explains].some((id) => covered.has(id))) continue;
    await repo.putGap({ id: repo.newId(), sectionId: c.conceptId, explains: c.explains, evidenceAskIds: c.askIds, signals: c.signals, status: 'suspected', createdAt: now });
    [c.conceptId, ...c.explains].forEach((id) => covered.add(id));
    open++;
  }
  return next;
}

/** The section ids marked orange in a subject. */
export async function gapMarks(repo: Repository, subjectId: string): Promise<string[]> {
  const ids = new Set((await repo.subjectNodes(subjectId)).map((n) => n.id));
  return (await repo.listGaps()).filter((g) => isOpen(g) && ids.has(g.sectionId)).map((g) => g.sectionId);
}

export interface GapCard {
  gap: Gap;
  path: string[]; // titles from the subject down to the gap's section
  asks: string[]; // the questions behind it, oldest first
  conversations: number;
}

/** A gap with what the card shows about it. */
export const gapCard = async (repo: Repository, gapId: string): Promise<GapCard> => cardOf(repo, await repo.gap(gapId));

async function cardOf(repo: Repository, gap: Gap): Promise<GapCard> {
  const byId = new Map((await repo.listAsks()).map((a) => [a.id, a]));
  const asks = gap.evidenceAskIds.map((id) => byId.get(id)).filter((a): a is Ask => a !== undefined).sort((a, b) => a.sentAt - b.sentAt);
  return { gap, path: (await repo.pathOf(gap.sectionId)).map((n) => n.title), asks: asks.map((a) => a.text), conversations: new Set(asks.map((a) => a.conversationUrl)).size };
}

/**
 * The gap to ask about in this subject now, if any: the one already asked today,
 * else, once a day, the open gap with the most evidence. Asking it is recorded.
 */
export async function nextGap(repo: Repository, subjectId: string, now: number, state: GapState): Promise<{ card: GapCard; state: GapState } | null> {
  const ids = new Set((await repo.subjectNodes(subjectId)).map((n) => n.id));
  const mine = (await repo.listGaps()).filter((g) => isOpen(g) && ids.has(g.sectionId));
  const today = mine.find((g) => g.askedAt !== undefined && now - g.askedAt < DAY_MS);
  if (today) return { card: await cardOf(repo, today), state };
  if (now - state.lastAskedAt < DAY_MS) return null;
  const best = mine.sort((a, b) => b.evidenceAskIds.length - a.evidenceAskIds.length)[0];
  if (!best) return null;
  const asked: Gap = { ...best, status: 'asked', askedAt: now };
  await repo.putGap(asked);
  return { card: await cardOf(repo, asked), state: { ...state, lastAskedAt: now } };
}

/** The live items anywhere below a section. */
async function itemsUnder(repo: Repository, sectionId: string): Promise<MapNode[]> {
  const nodes = await repo.subjectNodes((await repo.node(sectionId)).subjectId);
  const below = (id: string): MapNode[] => nodes.filter((n) => n.parentId === id).flatMap((n) => (n.kind === 'item' ? [n] : below(n.id)));
  return below(sectionId);
}
const textOf = (n: MapNode) => n.latex ?? n.title;

/** What "整理进来" would add: drafted once, kept on the gap. */
export async function proposeFill(repo: Repository, client: Pick<LlmClient, 'json'>, gapId: string): Promise<NonNullable<Gap['proposal']>> {
  const gap = await repo.gap(gapId);
  if (gap.proposal) return gap.proposal;
  const card = await cardOf(repo, gap);
  const existing = await itemsUnder(repo, gap.sectionId);
  const items = await client.json(fillPrompt({ path: card.path.join(SEP), existing: existing.map(textOf), asks: card.asks }), parseFill);
  // What the map already has is never added twice.
  const fresh = items.filter((i) => !existing.some((e) => sameItem(e, toItem(i))));
  await repo.putGap({ ...gap, proposal: fresh });
  return fresh;
}

const toItem = (i: { itemType: 'formula' | 'statement'; text: string }) =>
  i.itemType === 'formula' ? { itemType: i.itemType, title: '', latex: i.text } : { itemType: i.itemType, title: i.text };

/** "整理进来": the proposal, minus what the user unticked, joins the map as light-blue items. */
export async function fillGap(repo: Repository, gapId: string, skip: number[], now: number): Promise<string> {
  const gap = await repo.gap(gapId);
  if (!gap.proposal) throw new Error(`Gap ${gapId} has no proposal`);
  const group = await repo.addPluginItems(gap.sectionId, gap.proposal.filter((_, i) => !skip.includes(i)).map(toItem));
  await repo.putGap({ ...gap, status: 'filled', coolDownUntil: now + COOL_DOWN_DAYS * DAY_MS });
  return group;
}

/** "不用", or a passed question: no orange, not asked again for 30 days. */
export async function dismissGap(repo: Repository, gapId: string, now: number): Promise<void> {
  await repo.putGap({ ...(await repo.gap(gapId)), status: 'dismissed', coolDownUntil: now + COOL_DOWN_DAYS * DAY_MS });
}

/** "出道题试试": one question, kept so it is the same if asked again. */
export async function quizGap(repo: Repository, client: Pick<LlmClient, 'json'>, gapId: string): Promise<string> {
  const gap = await repo.gap(gapId);
  if (gap.quiz) return gap.quiz;
  const card = await cardOf(repo, gap);
  const question = await client.json(quizPrompt({ path: card.path.join(SEP), items: (await itemsUnder(repo, gap.sectionId)).map(textOf), asks: card.asks }), parseQuiz);
  await repo.putGap({ ...gap, quiz: question });
  return question;
}

/** The model judges the answer; a right one dismisses the gap. No score is kept. */
export async function judgeGap(repo: Repository, client: Pick<LlmClient, 'json'>, gapId: string, answer: string, now: number): Promise<{ correct: boolean; feedback: string }> {
  const gap = await repo.gap(gapId);
  if (!gap.quiz) throw new Error(`Gap ${gapId} has no question`);
  const path = (await repo.pathOf(gap.sectionId)).map((n) => n.title).join(SEP);
  const verdict = await client.json(judgePrompt({ path, question: gap.quiz, answer }), parseJudgement);
  if (verdict.correct) await dismissGap(repo, gapId, now);
  return verdict;
}
