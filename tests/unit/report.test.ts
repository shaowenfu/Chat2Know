import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { askPlace, generateReport } from '@/src/services/report';
import { parseReport, reportPrompt } from '@/src/llm/prompts';
import type { ChatMessage } from '@/src/llm/client';
import { chatReply } from '../mock-llm/server';

let seq = 0;
const labels = { window: '浮窗', notes: (n: number) => `${n} 条笔记` };

describe('the report prompt and reply', () => {
  it('gives the map, its outline, the questions by conversation and what the checks noticed', () => {
    const m = reportPrompt({
      lang: 'zh',
      map: '线性代数',
      today: '2026-11-06',
      outline: ['矩阵 (0 条笔记)', '矩阵 › 转置 (3 条笔记)'],
      asks: [
        { when: '11-02 14:05', where: '浮窗', text: 'AB 的第 i 行第 j 列怎么算？', conversation: 'a' },
        { when: '11-02 14:09', where: 'DeepSeek', text: '矩阵乘法的顺序为什么不能换？', conversation: 'b' },
      ],
      stuck: [{ when: '11-02 14:10', kind: 'circling', topic: '矩阵乘法' }],
    });
    expect(m[0]!.content).toMatch(/^\[task:report\]\n.*不打分/s);
    expect(m[1]!.content).toBe(
      '导图: 线性代数\n\n今天: 2026-11-06\n\n导图结构:\n矩阵 (0 条笔记)\n矩阵 › 转置 (3 条笔记)\n\n提问（按时间，按对话分段）:\n对话 1\n- [11-02 14:05 · 浮窗] AB 的第 i 行第 j 列怎么算？\n对话 2\n- [11-02 14:09 · DeepSeek] 矩阵乘法的顺序为什么不能换？\n\n之前的检查注意到:\n- 11-02 14:10: 绕圈子 (矩阵乘法)',
    );
  });

  it('unwraps a fenced reply and refuses an empty one', () => {
    expect(parseReport('```markdown\n## 概况\n\n文字\n```')).toBe('## 概况\n\n文字');
    expect(parseReport('  ## 概况  ')).toBe('## 概况');
    expect(() => parseReport('   ')).toThrow('empty report');
  });

  it('names where a question was asked', () => {
    expect(askPlace({ site: 'deepseek', via: 'site' }, '浮窗')).toBe('DeepSeek');
    expect(askPlace({ site: 'chat.example.com', via: 'site' }, '浮窗')).toBe('chat.example.com');
    expect(askPlace({ site: 'chatgpt', via: 'window' }, '浮窗')).toBe('浮窗');
  });
});

describe('generating a report', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  let map: string;
  beforeEach(async () => {
    let t = 1_700_000_000_000;
    const now = () => (t += 60_000);
    db = new Chat2KnowDB(`report-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
    map = (await repo.addSubject('线性代数')).node.id;
    await repo.addSection(map, '转置');
  });
  afterEach(() => db.delete());

  const client = () => {
    const prompts: string[] = [];
    return {
      prompts,
      chat: async (messages: ChatMessage[]) => {
        const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
        prompts.push(user);
        return chatReply(/\[task:(\w+)\]/.exec(messages[0]!.content)![1]!, user);
      },
    };
  };

  it('reads only this map’s questions and keeps each report, newest first', async () => {
    const other = (await repo.addSubject('概率论')).node.id;
    for (const text of ['转置是什么？', '为什么顺序反过来？']) await repo.recordAsk({ site: 'chatgpt', conversationUrl: 'https://chatgpt.com/c/1', text, via: 'site', mapId: map });
    await repo.recordAsk({ site: 'chatgpt', conversationUrl: 'https://chatgpt.com/c/2', text: '期望是什么？', via: 'site', mapId: other });
    const c = client();
    const first = await generateReport(repo, c, map, 'zh', labels, 1);
    expect(first).toMatchObject({ mapId: map, askCount: 2, createdAt: 1 });
    expect(first.markdown).toContain('你在这张导图里问了 2 个问题');
    expect(c.prompts[0]).toContain('转置 (0 条笔记)');
    expect(c.prompts[0]).not.toContain('期望');
    const second = await generateReport(repo, c, map, 'zh', labels, 2);
    expect((await repo.reports(map)).map((r) => r.id)).toEqual([second.id, first.id]);
    expect(await repo.reports(other)).toEqual([]);
  });

  it('needs questions; clearing the questions clears the reports and checks made from them', async () => {
    await expect(generateReport(repo, client(), map, 'zh', labels, 1)).rejects.toThrow('no questions');
    await repo.recordAsk({ site: 'chatgpt', conversationUrl: 'https://chatgpt.com/c/1', text: 'q', via: 'site', mapId: map });
    await generateReport(repo, client(), map, 'zh', labels, 1);
    await repo.clearAsks();
    expect(await repo.reports(map)).toEqual([]);
    expect(await repo.listAsks()).toEqual([]);
  });
});
