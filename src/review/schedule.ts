import type { Review, Verdict } from '@/src/db/types';

export const DAY_MS = 24 * 60 * 60 * 1000;
const GROWTH: Record<Verdict, number> = { pass: 2.5, partial: 1.2, fail: 0 };

/**
 * Smallest schedule that behaves like spaced repetition: a pass multiplies the
 * interval by 2.5 (first pass: 1 day), a partial by 1.2, a fail resets to 1 day.
 */
export function nextInterval(previous: number | undefined, verdict: Verdict): number {
  if (previous === undefined || verdict === 'fail') return 1;
  return Math.max(1, Math.round(previous * GROWTH[verdict] * 10) / 10);
}

/** A card is due when it has never been reviewed or its last review's due time has passed. */
export function isDue(latest: Review | undefined, now: number): boolean {
  return !latest || latest.dueAt <= now;
}
