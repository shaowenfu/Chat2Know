import { describe, expect, it } from 'vitest';
import { shouldRecord } from '@/src/recording/settings';

describe('shouldRecord', () => {
  const on = { origins: ['https://chatgpt.com'], paused: false, excluded: ['https://chatgpt.com/c/private'] };

  it('records only on ticked origins, while not paused, outside excluded conversations', () => {
    expect(shouldRecord(on, 'https://chatgpt.com/c/1')).toBe(true);
    expect(shouldRecord(on, 'https://claude.ai/chat/1')).toBe(false);
    expect(shouldRecord({ ...on, paused: true }, 'https://chatgpt.com/c/1')).toBe(false);
    expect(shouldRecord(on, 'https://chatgpt.com/c/private#reply')).toBe(false);
    expect(shouldRecord({ origins: [], paused: false, excluded: [] }, 'https://chatgpt.com/c/1')).toBe(false);
  });
});
