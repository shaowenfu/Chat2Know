import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';

let seq = 0;

function setup(name: string) {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  const db = new Chat2KnowDB(`${name}-${seq++}`);
  return { db, repo: new Repository(db, new Hlc('dev1', now), now) };
}

describe('recorded questions', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => ({ db, repo } = setup('asks')));
  afterEach(() => db.delete());

  it('stores asks newest first, outside the oplog', async () => {
    await repo.recordAsk({ site: 'chatgpt', conversationUrl: 'https://chatgpt.com/c/1#x', text: 'why transpose?' });
    await repo.recordAsk({ site: 'chatgpt', conversationUrl: 'https://chatgpt.com/c/2', text: 'what is a trace?' });
    expect((await repo.listAsks()).map((a) => [a.text, a.conversationUrl])).toEqual([
      ['what is a trace?', 'https://chatgpt.com/c/2'],
      ['why transpose?', 'https://chatgpt.com/c/1'],
    ]);
    expect(await db.oplog.count()).toBe(0);
  });

  it('deletes one ask, a whole conversation, or everything', async () => {
    const a = await repo.recordAsk({ site: 'kimi', conversationUrl: 'https://www.kimi.com/chat/1', text: 'a' });
    await repo.recordAsk({ site: 'kimi', conversationUrl: 'https://www.kimi.com/chat/1', text: 'b' });
    await repo.recordAsk({ site: 'kimi', conversationUrl: 'https://www.kimi.com/chat/2', text: 'c' });
    await repo.deleteAsk(a.id);
    expect((await repo.listAsks()).map((x) => x.text)).toEqual(['c', 'b']);
    await repo.deleteConversationAsks('https://www.kimi.com/chat/1#top');
    expect((await repo.listAsks()).map((x) => x.text)).toEqual(['c']);
    await repo.clearAsks();
    expect(await repo.listAsks()).toEqual([]);
  });
});

describe('Hlc', () => {
  it('is strictly increasing even when the wall clock stalls or goes back', () => {
    const times = [5, 5, 4, 6];
    const clock = new Hlc('d', () => times.shift() ?? 6);
    const ticks = [clock.tick(), clock.tick(), clock.tick(), clock.tick()];
    expect([...ticks].sort()).toEqual(ticks);
    expect(new Set(ticks).size).toBe(4);
  });
});
