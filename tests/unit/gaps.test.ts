import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { DAY_MS, EMPTY_STATE, analyze, dismissGap, fillGap, gapMarks, judgeGap, nextGap, proposeFill, quizGap } from '@/src/services/gaps';
import { recordItem } from '@/src/services/record';
import { parsePrereqs, parseTags } from '@/src/llm/prompts';
import type { ChatMessage } from '@/src/llm/client';
import { chatReply, mockEmbedding } from '../mock-llm/server';

let seq = 0;
const T0 = Date.UTC(2026, 9, 20, 9);
const client = {
  prompts: [] as string[],
  json: async <T>(messages: ChatMessage[], parse: (v: unknown) => T) => {
    client.prompts.push(/\[task:(\w+)\]/.exec(messages[0]!.content)![1]!);
    return parse(JSON.parse(chatReply(/\[task:(\w+)\]/.exec(messages[0]!.content)![1]!, messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'))));
  },
  embed: async (texts: string[]) => texts.map(mockEmbedding),
};

describe('gaps', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  let clock: number;
  let ids: Record<string, string>;
  beforeEach(async () => {
    clock = T0;
    const now = () => (clock += 1000);
    db = new Chat2KnowDB(`gaps-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
    client.prompts.length = 0;
    const { node: s } = await repo.addSubject('线性代数');
    const { node: m } = await repo.addSection(s.id, '矩阵');
    const { node: mul } = await repo.addSection(m.id, '矩阵乘法');
    const { node: t } = await repo.addSection(m.id, '转置');
    await repo.addSection(m.id, '逆矩阵');
    await repo.addItem({ parentId: t.id }, { itemType: 'formula', title: '', latex: '(AB)^T = B^T A^T' });
    ids = { subject: s.id, transpose: t.id, multiply: mul.id };
    for (const [url, text] of [
      ['https://chatgpt.com/c/1', '为什么转置之后顺序要反过来？'],
      ['https://chatgpt.com/c/1', '转置和逆的顺序规则一样吗？'],
      ['https://chatgpt.com/c/2', 'What is the transpose of a product?'],
      ['https://chatgpt.com/c/2', '帮我润色这段话'],
    ] as const) {
      await repo.recordAsk({ site: 'chatgpt', conversationUrl: url, text });
    }
  });
  afterEach(() => db.delete());

  it('tags questions onto sections, marks the section they keep coming back to, silently', async () => {
    const state = await analyze(repo, client, '', clock, EMPTY_STATE);
    expect(client.prompts).toEqual(['tag', 'prereq']);
    expect(await repo.untaggedAsks(10)).toEqual([]);
    expect(await gapMarks(repo, ids.subject!)).toEqual([ids.transpose]);
    // Nothing new: no model call, no second gap on the same section.
    client.prompts.length = 0;
    await analyze(repo, client, '', clock, state);
    expect(client.prompts).toEqual([]);
    expect(await repo.listGaps()).toHaveLength(1);
  });

  it('asks about one gap a day; 不用 keeps it quiet for 30 days', async () => {
    let state = await analyze(repo, client, '', clock, EMPTY_STATE);
    const first = await nextGap(repo, ids.subject!, clock, state);
    expect(first!.card.path).toEqual(['线性代数', '矩阵', '转置']);
    expect([first!.card.asks.length, first!.card.conversations]).toEqual([3, 2]);
    state = first!.state;
    // The same card while it is today.
    expect((await nextGap(repo, ids.subject!, clock + 3600_000, state))!.card.gap.id).toBe(first!.card.gap.id);
    await dismissGap(repo, first!.card.gap.id, clock);
    expect(await gapMarks(repo, ids.subject!)).toEqual([]);
    expect(await nextGap(repo, ids.subject!, clock + 3600_000, state)).toBeNull();
    // New questions on the same section within 30 days make no new gap.
    await repo.recordAsk({ site: 'chatgpt', conversationUrl: 'https://chatgpt.com/c/3', text: '转置到底是什么' });
    state = await analyze(repo, client, '', clock + 10 * DAY_MS, state);
    expect(await gapMarks(repo, ids.subject!)).toEqual([]);
    await analyze(repo, client, '', clock + 31 * DAY_MS, state);
    expect(await gapMarks(repo, ids.subject!)).toEqual([]); // the questions are older than the 14-day window by then
  });

  it('整理进来 adds the missing items in light blue; recording one of them makes it the user’s', async () => {
    const state = await analyze(repo, client, '', clock, EMPTY_STATE);
    const { card } = (await nextGap(repo, ids.subject!, clock, state))!;
    const proposal = await proposeFill(repo, client, card.gap.id);
    expect(proposal.map((p) => p.text)).toEqual(['(A+B)^T = A^T + B^T', '(A^T)^T = A', 'A 与 A^T 的秩相同。']);
    await fillGap(repo, card.gap.id, [2], clock);
    const items = (await repo.listItems()).filter((i) => i.parentId === ids.transpose);
    expect(items.map((i) => [i.latex ?? i.title, i.origin])).toEqual([
      ['(AB)^T = B^T A^T', 'user'],
      ['(A+B)^T = A^T + B^T', 'plugin'],
      ['(A^T)^T = A', 'plugin'],
    ]);
    expect(await gapMarks(repo, ids.subject!)).toEqual([]);
    const source = { url: 'https://chatgpt.com/c/9', pageTitle: '', quoteExact: '', quotePrefix: '', quoteSuffix: '', capturedAt: 0 };
    const r = await recordItem(repo, { itemType: 'formula', title: '', latex: '(A^T)^T=A', source }, { unplaced: '', newSubject: '' });
    expect(r.status).toBe('recorded');
    expect(await repo.node(r.itemId)).toMatchObject({ origin: 'user', source });
  });

  it('出道题试试: one question; a right answer dismisses the gap, a wrong one keeps it', async () => {
    const state = await analyze(repo, client, '', clock, EMPTY_STATE);
    const { card } = (await nextGap(repo, ids.subject!, clock, state))!;
    expect(await quizGap(repo, client, card.gap.id)).toBe('(AB)^T 等于什么？');
    expect((await judgeGap(repo, client, card.gap.id, 'A^T B^T', clock)).correct).toBe(false);
    expect(await gapMarks(repo, ids.subject!)).toEqual([ids.transpose]);
    expect((await judgeGap(repo, client, card.gap.id, 'B^T A^T', clock)).correct).toBe(true);
    expect(await gapMarks(repo, ids.subject!)).toEqual([]);
  });

  it('rejects malformed tags and prerequisites', () => {
    expect(() => parseTags({ tags: [{ ask: 1, sections: [9] }] }, 1, 3)).toThrow('section');
    expect(() => parseTags({ tags: [] }, 1, 3)).toThrow('Expected 1');
    expect(() => parsePrereqs({ edges: [{ from: 1, to: 1 }] }, 2)).toThrow('own prerequisite');
    expect(parseTags({ tags: [{ ask: 1, sections: [2, 2] }] }, 1, 3)).toEqual([[1]]);
  });
});
