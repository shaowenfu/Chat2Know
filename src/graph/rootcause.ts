import { levels, prerequisiteClosure, type Link } from './prereq';
import type { SignalKind, Symptom } from './signals';

/** A circling run gets this weight once the model names the concept behind it. */
export const CIRCLING_WEIGHT = 3;

/** A concept as a possible root of the learner's trouble, with the symptoms it would explain. */
export interface RootCandidate {
  conceptId: string;
  score: number;
  /** Concepts with symptoms that this one is (or is a prerequisite of). */
  explains: string[];
  signals: { kind: SignalKind; count: number }[];
  askIds: string[];
}

/** A symptom with a weight: repeat and downshift counts, or a circling run's concept. */
export interface WeightedSymptom extends Symptom {
  circling?: number;
}

const weight = (s: WeightedSymptom) => (s.signals.repeat ?? 0) + (s.signals.downshift ?? 0) + (s.circling ? CIRCLING_WEIGHT : 0);

/**
 * Ranks concepts by how much of the learner's trouble they explain: each concept
 * scores the weights of the symptoms on itself and on everything that builds on
 * it. A candidate must explain at least two symptoms, or one strong one (a repeat
 * or circling). Ties go to the most specific concept (highest level), so a shared
 * foundation wins over the whole domain's root.
 */
export function rankRootCauses(symptoms: WeightedSymptom[], conceptIds: string[], edges: Link[]): RootCandidate[] {
  const level = levels(conceptIds, edges);
  const below = new Map(symptoms.map((s) => [s.conceptId, prerequisiteClosure(s.conceptId, edges)]));
  const candidates: RootCandidate[] = [];
  for (const id of conceptIds) {
    const covered = symptoms.filter((s) => s.conceptId === id || below.get(s.conceptId)!.has(id));
    const strong = covered.some((s) => s.signals.repeat || s.circling);
    if (covered.length < 2 && !strong) continue;
    const signals = (['repeat', 'downshift', 'circling'] as const)
      .map((kind) => ({ kind, count: covered.reduce((n, s) => n + (kind === 'circling' ? (s.circling ?? 0) : (s.signals[kind] ?? 0)), 0) }))
      .filter((s) => s.count > 0);
    candidates.push({
      conceptId: id,
      score: covered.reduce((n, s) => n + weight(s), 0),
      explains: covered.map((s) => s.conceptId),
      signals,
      askIds: [...new Set(covered.flatMap((s) => s.askIds))],
    });
  }
  return candidates.sort((a, b) => b.score - a.score || (level.get(b.conceptId) ?? 0) - (level.get(a.conceptId) ?? 0));
}
