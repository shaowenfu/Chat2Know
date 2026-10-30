import type { LlmClient } from '@/src/llm/client';
import {
  diagnosisJudgePrompt,
  diagnosisQuizPrompt,
  parseDiagnosisJudgement,
  parseDiagnosisQuiz,
  parseReviewCards,
  systematicReviewPrompt,
  type DiagnosisContext,
} from '@/src/llm/prompts';
import type { AskView, Repository } from '@/src/db/repository';
import type { Diagnosis, Verdict } from '@/src/db/types';
import { levels, prerequisiteClosure } from '@/src/graph/prereq';

/** Share of quiz items that must pass to withdraw a diagnosis. */
export const QUIZ_PASS_RATE = 0.6;

export interface DiagnosisView extends Diagnosis {
  concept: { name: string; domain: string; nodeId?: string };
  /** Names of the concepts the evidence questions were about. */
  about: string[];
  evidence: Pick<AskView, 'id' | 'text' | 'conversationUrl' | 'sentAt' | 'site'>[];
  /** Confirmed, and every card to know by heart under the concept's card passed a check since. */
  remediated: boolean;
}

/**
 * Open diagnoses (suspected or confirmed), newest first, with their evidence.
 * Deleted questions drop out of the evidence; a suspicion left with none is not shown.
 */
export async function listDiagnosisViews(repo: Repository): Promise<DiagnosisView[]> {
  const concepts = new Map((await repo.listConcepts()).map((c) => [c.id, c]));
  const asks = new Map((await repo.listAskViews()).map((a) => [a.id, a]));
  const open = (await repo.listDiagnoses()).filter((d) => d.status !== 'dismissed');
  const passes = open.length ? await repo.passesSince(Math.min(...open.map((d) => d.decidedAt ?? d.createdAt))) : [];
  const views: DiagnosisView[] = [];
  for (const d of open) {
    const c = concepts.get(d.rootConceptId)!;
    const evidence = d.evidenceAskIds.map((id) => asks.get(id)).filter((a): a is AskView => !!a);
    // A suspicion whose questions were all deleted has nothing left to stand on.
    if (d.status === 'suspected' && !evidence.length) continue;
    // The concept's card may have been deleted or merged away since it was linked.
    const nodeId = c.nodeId && (await repo.getNode(c.nodeId))?.deletedAt === undefined ? c.nodeId : undefined;
    let remediated = false;
    if (d.status === 'confirmed' && nodeId) {
      const mustKnow = (await repo.subtree(nodeId)).filter((n) => n.mastery === 'internalize' && n.type === 'knowledge');
      const passed = new Set(passes.filter((p) => p.at >= d.decidedAt!).map((p) => p.nodeId));
      remediated = mustKnow.length > 0 && mustKnow.every((n) => passed.has(n.id));
    }
    views.push({
      ...d,
      concept: { name: c.name, domain: c.domain, ...(nodeId ? { nodeId } : {}) },
      about: [...new Set(evidence.flatMap((a) => a.concepts))],
      evidence: evidence.map(({ id, text, conversationUrl, sentAt, site }) => ({ id, text, conversationUrl, sentAt, site })),
      remediated,
    });
  }
  return views;
}

/** What the model needs to know about a diagnosis: the concept, what it rests on, and the learner's questions. */
async function context(repo: Repository, d: Diagnosis): Promise<DiagnosisContext> {
  const concepts = await repo.listConcepts();
  const edges = await repo.listPrereqEdges();
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const level = levels(concepts.map((c) => c.id), edges);
  const below = [...prerequisiteClosure(d.rootConceptId, edges)].sort((a, b) => level.get(a)! - level.get(b)!);
  const asks = new Map((await repo.listAsks()).map((a) => [a.id, a.text]));
  const root = byId.get(d.rootConceptId)!;
  return {
    domain: root.domain,
    concept: root.name,
    prerequisites: below.map((id) => byId.get(id)!.name),
    evidence: d.evidenceAskIds.map((id) => asks.get(id)).filter((t): t is string => t !== undefined),
  };
}

export async function diagnosisQuiz(repo: Repository, client: LlmClient, id: string): Promise<{ question: string; expected: string }[]> {
  return client.json(diagnosisQuizPrompt(await context(repo, await repo.getDiagnosis(id))), parseDiagnosisQuiz);
}

/** Judges the quiz. Passing withdraws the diagnosis; failing confirms it. */
export async function checkDiagnosisQuiz(
  repo: Repository,
  client: LlmClient,
  id: string,
  items: { question: string; expected: string }[],
  answers: string[],
): Promise<{ results: { verdict: Verdict; feedback: string }[]; passed: boolean }> {
  const d = await repo.getDiagnosis(id);
  const { concept } = await context(repo, d);
  const results = await client.json(diagnosisJudgePrompt({ concept, items, answers }), (v) => parseDiagnosisJudgement(v, items.length));
  const passed = results.filter((r) => r.verdict === 'pass').length / items.length >= QUIZ_PASS_RATE;
  await repo.addQuiz({ diagnosisId: id, items, answers, results, passed });
  if (passed) await repo.decideDiagnosis(id, 'dismissed');
  else await confirm(repo, d);
  return { results, passed };
}

/** The learner's own verdict, skipping the quiz: accurate confirms, not accurate dismisses. */
export async function decide(repo: Repository, id: string, accurate: boolean): Promise<void> {
  const d = await repo.getDiagnosis(id);
  if (accurate) await confirm(repo, d, 'accurate');
  else await repo.decideDiagnosis(id, 'dismissed', 'inaccurate');
}

/** A confirmed gap gets a card on the map (the linked one, or a new topic card) to hang the review under. */
async function confirm(repo: Repository, d: Diagnosis, feedback?: Diagnosis['feedback']): Promise<void> {
  await repo.conceptNode(d.rootConceptId);
  await repo.decideDiagnosis(d.id, 'confirmed', feedback);
}

/** Proposes review cards from the foundations up; nothing is kept until the learner picks. */
export async function systematicReview(repo: Repository, client: LlmClient, id: string): Promise<{ question: string; summary: string }[]> {
  return client.json(systematicReviewPrompt(await context(repo, await repo.getDiagnosis(id))), parseReviewCards);
}

/** Keeps the picked review cards under the concept's card, to know by heart unless the learner unticked it. */
export async function keepReview(repo: Repository, id: string, cards: { question: string; summary: string }[], internalize: boolean): Promise<number> {
  const node = await repo.conceptNode((await repo.getDiagnosis(id)).rootConceptId);
  const ids = await repo.addCards(
    cards.map((c) => ({ title: c.question, summary: c.summary })),
    undefined,
    { under: node.id, ...(internalize ? { mastery: 'internalize' as const } : {}) },
  );
  return ids.length;
}
