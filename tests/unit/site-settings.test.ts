import { describe, expect, it } from 'vitest';
import { shouldRecord } from '@/src/sites/settings';

describe('shouldRecord', () => {
  const on = { origins: ['https://chatgpt.com'], recordAsks: true, excluded: ['https://chatgpt.com/c/private'] };

  it('records only on ticked origins, when asked to, outside excluded conversations', () => {
    expect(shouldRecord(on, 'https://chatgpt.com/c/1')).toBe(true);
    expect(shouldRecord(on, 'https://claude.ai/chat/1')).toBe(false);
    expect(shouldRecord({ ...on, recordAsks: false }, 'https://chatgpt.com/c/1')).toBe(false);
    expect(shouldRecord(on, 'https://chatgpt.com/c/private#reply')).toBe(false);
    expect(shouldRecord({ origins: [], recordAsks: true, excluded: [] }, 'https://chatgpt.com/c/1')).toBe(false);
  });
});
