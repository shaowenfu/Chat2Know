import { describe, expect, it } from 'vitest';
import { AUTO_ANALYZE_AT, DIAGNOSE_EVERY_MS, autoAnalysis } from '@/src/services/analysis';

describe('autoAnalysis', () => {
  const now = 10 * DIAGNOSE_EVERY_MS;

  it('a full batch starts a run; it diagnoses only if a day has passed since the last diagnosis', () => {
    expect(autoAnalysis(AUTO_ANALYZE_AT, now - 1000, now)).toEqual({ run: true, diagnose: false });
    expect(autoAnalysis(AUTO_ANALYZE_AT, now - DIAGNOSE_EVERY_MS, now)).toEqual({ run: true, diagnose: true });
  });

  it('a smaller batch waits for the daily run', () => {
    expect(autoAnalysis(3, now - 1000, now)).toEqual({ run: false, diagnose: false });
    expect(autoAnalysis(3, now - DIAGNOSE_EVERY_MS, now)).toEqual({ run: true, diagnose: true });
    expect(autoAnalysis(1, undefined, now)).toEqual({ run: true, diagnose: true }); // the very first question
  });

  it('nothing waiting, nothing to run', () => {
    expect(autoAnalysis(0, undefined, now)).toEqual({ run: false, diagnose: true });
  });
});
