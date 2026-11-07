import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { CHECK_EVERY, checkDue, checkStuck, stuckView } from '@/src/services/stuck';
import { parseStuck, stuckPrompt } from '@/src/llm/prompts';
import type { ChatMessage } from '@/src/llm/client';
import { chatReply } from '../mock-llm/server';

let seq = 0;
const HOUR = 3_600_000;

/** A client answering like the mock server, keeping the prompts it saw. */
function stubClient() {
  const prompts: string[] = [];
  return {
    prompts,
    json: async <T>(messages: ChatMessage[], parse: (v: unknown) => T) => {
      const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
      prompts.push(user);
      return parse(JSON.parse(chatReply(/\[task:(\w+)\]/.exec(messages[0]!.content)![1]!, user)));
    },
  };
}

describe('the stuck check', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  let t: number;
  let map: string;
  let multiplication: string;
  beforeEach(async () => {
    t = new Date(2026, 10, 6, 9).getTime();
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`stuck-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
    map = (await repo.addSubject('线性代数')).node.id;
    const chapter = (await repo.addSection(map, '矩阵')).node.id;
    multiplication = (await repo.addSection(chapter, '矩阵乘法')).node.id;
    await repo.addSection(chapter, '转置');
  });
  afterEach(() => db.delete());

  const ask = (text: string, mapId: string | null = map, url = 'https://chatgpt.com/c/1', via: 'site' | 'window' = 'site') =>
    repo.recordAsk({ site: 'chatgpt', conversationUrl: url, text, via, ...(mapId ? { mapId } : {}) });

  it('is due every 5 new questions in a map; other maps and questions with no map do not count', async () => {
    const other = (await repo.addSubject('概率论')).node.id;
    for (let i = 0; i < CHECK_EVERY - 1; i++) await ask(`question ${i}`);
    await ask('elsewhere', other);
    await ask('no map open', null);
    expect(await checkDue(repo, map)).toBe(false);
    await ask('the fifth');
    expect(await checkDue(repo, map)).toBe(true);
    await checkStuck(repo, stubClient(), map, 'zh', t);
    expect(await checkDue(repo, map)).toBe(false);
    for (let i = 0; i < CHECK_EVERY - 1; i++) await ask(`more ${i}`);
    expect(await checkDue(repo, map)).toBe(false);
    await ask('the tenth');
    expect(await checkDue(repo, map)).toBe(true);
  });

  it('reads the map’s latest 30 questions in order, by conversation, with its topics', async () => {
    for (let i = 1; i <= 32; i++) await ask(`q${i}`, map, i <= 20 ? 'https://chatgpt.com/c/1' : 'https://claude.ai/chat/2', i === 32 ? 'window' : 'site');
    const client = stubClient();
    const check = await checkStuck(repo, client, map, 'zh', t);
    expect(check.askIds).toHaveLength(30);
    expect(client.prompts[0]).toBe(
      [
        '导图: 线性代数',
        '',
        '提问:',
        '对话 1',
        ...Array.from({ length: 18 }, (_, i) => `[${i + 1}] q${i + 3}`),
        '对话 2',
        ...Array.from({ length: 11 }, (_, i) => `[${i + 19}] q${i + 21}`),
        '[30] q32（浮窗）',
        '',
        '知识点:',
        '[1] 矩阵',
        '[2] 矩阵 › 矩阵乘法',
        '[3] 矩阵 › 转置',
      ].join('\n'),
    );
    expect(check.stuck).toBe(false);
    expect(await stuckView(repo, map, t)).toEqual({ marks: [] });
  });

  it('when stuck: one card with the topic marked orange; 不用 puts it away and keeps the map quiet for the day', async () => {
    for (const q of ['矩阵乘法为什么不能交换？', '那 AB 和 BA 维度怎么对不上？', '为什么矩阵乘法要行乘列？', '转置是什么？', '再解释一下矩阵乘法的顺序']) await ask(q);
    const check = await checkStuck(repo, stubClient(), map, 'zh', t);
    expect(check).toMatchObject({ stuck: true, kind: 'circling', sectionId: multiplication });
    const view = await stuckView(repo, map, t);
    expect(view.marks).toEqual([multiplication]);
    expect(view.card).toEqual({
      checkId: check.id,
      kind: 'circling',
      path: ['矩阵', '矩阵乘法'],
      explanation: '最近 3 个问题都在问「矩阵乘法」。先把它的定义弄清楚，后面会容易很多。',
      betterQuestion: '用一个具体的例子，一步步讲清楚「矩阵乘法」是怎么算的。',
      asks: ['矩阵乘法为什么不能交换？', '为什么矩阵乘法要行乘列？', '再解释一下矩阵乘法的顺序'], // the questions the model named
    });

    await repo.dismissStuck(check.id, t);
    expect(await stuckView(repo, map, t)).toEqual({ marks: [] });
    // Five more the same day: the check runs, but the map stays quiet until tomorrow.
    for (let i = 0; i < 5; i++) await ask(`矩阵乘法还是不懂 ${i}`);
    await checkStuck(repo, stubClient(), map, 'zh', t);
    expect(await stuckView(repo, map, t + HOUR)).toEqual({ marks: [] });
    expect((await stuckView(repo, map, t + 24 * HOUR)).marks).toEqual([multiplication]);
  });

  it('a later check that sees progress takes the card and the mark away; a deleted topic is not marked', async () => {
    for (let i = 0; i < 5; i++) await ask(`矩阵乘法 ${i}`);
    await checkStuck(repo, stubClient(), map, 'zh', t);
    await repo.remove(multiplication);
    const view = await stuckView(repo, map, t);
    expect(view.marks).toEqual([]);
    expect(view.card?.path).toEqual([]);
    for (let i = 0; i < 5; i++) await ask(`another topic ${i}`, map, 'https://chatgpt.com/c/9');
    // The window is the latest 30, which still holds the five; the mock sees them and says stuck again.
    expect((await checkStuck(repo, stubClient(), map, 'zh', t)).stuck).toBe(true);
  });
});

describe('the stuck reply', () => {
  it('is validated strictly; numbers become positions', () => {
    expect(parseStuck({ stuck: false }, 5, 3)).toEqual({ stuck: false });
    expect(parseStuck({ stuck: true, kind: 'phrasing', section: 0, explanation: 'e', question: 'q', evidence: [3, 1, 3] }, 5, 3)).toEqual({
      stuck: true,
      kind: 'phrasing',
      section: -1,
      explanation: 'e',
      question: 'q',
      evidence: [0, 2],
    });
    const good = { stuck: true, kind: 'stuck', section: 2, explanation: 'e', question: 'q', evidence: [1] };
    expect(() => parseStuck({ ...good, stuck: 'yes' }, 5, 3)).toThrow('stuck');
    expect(() => parseStuck({ ...good, kind: 'confused' }, 5, 3)).toThrow('kind');
    expect(() => parseStuck({ ...good, section: 4 }, 5, 3)).toThrow('section');
    expect(() => parseStuck({ ...good, evidence: [] }, 5, 3)).toThrow('evidence');
    expect(() => parseStuck({ ...good, evidence: [6] }, 5, 3)).toThrow('question number');
    expect(() => parseStuck({ ...good, question: ' ' }, 5, 3)).toThrow('question');
  });

  it('the prompt is written in the chosen language', () => {
    const input = { map: '', asks: [{ text: 'why?', conversation: 'c', window: false }], sections: [] };
    expect(stuckPrompt({ ...input, lang: 'en' })[1]!.content).toBe('Map: (unnamed)\n\nQuestions:\nConversation 1\n[1] why?\n\nTopics:\n(none)');
    expect(stuckPrompt({ ...input, lang: 'zh' })[0]!.content).toMatch(/^\[task:stuck\]\n.*用中文写。$/s);
  });
});
