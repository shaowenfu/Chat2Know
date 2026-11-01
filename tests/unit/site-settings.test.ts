import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSites, migrateV01Sites, shouldRecord } from '@/src/sites/settings';

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

describe('migrating 0.1 site settings', () => {
  it('carries the ticked sites over, recording on unless paused, and drops 0.1 keys', async () => {
    fakeBrowser.reset();
    await fakeBrowser.storage.local.set({ recording: { origins: ['https://chatgpt.com'], paused: true, excluded: ['https://chatgpt.com/c/x'] }, analysis: { at: 1 } });
    await migrateV01Sites();
    expect(await loadSites()).toEqual({ origins: ['https://chatgpt.com'], recordAsks: false, excluded: ['https://chatgpt.com/c/x'] });
    expect(await fakeBrowser.storage.local.get(['recording', 'analysis'])).toEqual({});
    await migrateV01Sites(); // nothing left to migrate
    expect((await loadSites()).origins).toEqual(['https://chatgpt.com']);
  });
});
