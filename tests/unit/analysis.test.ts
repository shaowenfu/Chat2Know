import { describe, expect, it } from 'vitest';
import { AUTO_ANALYZE_AT, DIAGNOSE_EVERY_MS, autoAnalysis } from '@/src/services/analysis';

describe('autoAnalysis', () => {
  const now = 10 * DIAGNOSE_EVERY_MS;

  it('a full batch starts a run; it diagnoses only if a day has passed since the last diagnosis', () => {
    expect(autoAnalysis(AUTO_ANALYZE_AT, { lastDiagnosedAt: now - 1000 }, now)).toEqual({ run: true, diagnose: false });
    expect(autoAnalysis(AUTO_ANALYZE_AT, { lastDiagnosedAt: now - DIAGNOSE_EVERY_MS }, now)).toEqual({ run: true, diagnose: true });
  });

  it('a smaller batch waits for the daily run', () => {
    expect(autoAnalysis(3, { lastDiagnosedAt: now - 1000 }, now)).toEqual({ run: false, diagnose: false });
    expect(autoAnalysis(3, { lastDiagnosedAt: now - DIAGNOSE_EVERY_MS }, now)).toEqual({ run: true, diagnose: true });
    expect(autoAnalysis(1, {}, now)).toEqual({ run: true, diagnose: true }); // the very first question
  });

  it('nothing waiting, nothing to run', () => {
    expect(autoAnalysis(0, {}, now)).toEqual({ run: false, diagnose: true });
  });

  it('after a failed run nothing starts on its own for a day', () => {
    expect(autoAnalysis(AUTO_ANALYZE_AT, { failedAt: now - 1000 }, now).run).toBe(false);
    expect(autoAnalysis(AUTO_ANALYZE_AT, { failedAt: now - DIAGNOSE_EVERY_MS }, now).run).toBe(true);
  });
});
