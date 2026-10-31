import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { recordItem, type RecordRequest } from '@/src/services/record';
import { placeItem } from '@/src/services/placement';
import { parsePlacement } from '@/src/llm/prompts';
import type { ChatMessage } from '@/src/llm/client';
import { chatReply, mockEmbedding } from '../mock-llm/server';
import type { MapTree } from '@/src/graph/tree';

let seq = 0;
const labels = { unplaced: '待归位', newSubject: '未命名学科' };
const source = (url = 'https://chatgpt.com/c/1') => ({ url, pageTitle: 'Chat', quoteExact: 'q', quotePrefix: '', quoteSuffix: '', capturedAt: 1 });
const formula = (latex: string, url?: string): RecordRequest => ({ itemType: 'formula', title: '', latex, source: source(url) });

/** A client answering like the mock server, keeping the prompts and embedded texts it saw. */
function stubClient() {
  const prompts: string[] = [];
  const embedded: string[] = [];
  return {
    prompts,
    embedded,
    json: async <T>(messages: ChatMessage[], parse: (v: unknown) => T) => {
      const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
      prompts.push(user);
      return parse(JSON.parse(chatReply(/\[task:(\w+)\]/.exec(messages[0]!.content)![1]!, user)));
    },
    embed: async (texts: string[]) => {
      embedded.push(...texts);
      return texts.map(mockEmbedding);
    },
  };
}

const outline = (t: MapTree, indent = ''): string[] => [
  `${indent}${t.node.role ? '[unplaced]' : t.node.latex ?? t.node.title}`,
  ...t.children.flatMap((c) => outline(c, `${indent}  `)),
];

describe('automatic placement', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`place-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
  });
  afterEach(() => db.delete());

  async function recordAndPlace(req: RecordRequest, client = stubClient(), embeddingModel = '') {
    const r = await recordItem(repo, req, labels);
    if (r.status !== 'recorded') throw new Error('not recorded');
    const path = await placeItem(repo, client, embeddingModel, { itemId: r.itemId, group: r.group, before: 'b', after: 'a', untitled: labels.newSubject, unplaced: labels.unplaced });
    return { r, path, client };
  }

  it('names the untitled subject, adds the topic, and one undo takes it all back', async () => {
    const { r, path, client } = await recordAndPlace(formula('(AB)^T = B^T A^T'));
    expect(path).toEqual(['线性代数', '矩阵', '转置']);
    expect(client.prompts[0]).toContain('Note (formula): (AB)^T = B^T A^T');
    expect(client.prompts[0]).toContain('Now in: 未命名学科 › 待归位');
    const [subject] = await repo.listSubjects();
    expect(outline(await repo.subjectTree(subject!.id))).toEqual(['线性代数', '  矩阵', '    转置', '      (AB)^T = B^T A^T']);
    await repo.undo(r.group);
    expect(await repo.listSubjects()).toEqual([]);
  });

  it('files into existing topics and subjects without duplicating them; an empty untitled subject goes', async () => {
    await recordAndPlace(formula('(AB)^T = B^T A^T'));
    await recordAndPlace(formula('(A^T)^T = A', 'https://claude.ai/chat/2'));
    const { path } = await recordAndPlace(formula('\\mathrm{softmax}(z)_i', 'https://kimi.com/chat/3'));
    expect(path).toEqual(['深度学习', '注意力机制']);
    const subjects = await repo.listSubjects();
    expect(subjects.map((s) => s.title)).toEqual(['线性代数', '深度学习']);
    expect(outline(await repo.subjectTree(subjects[0]!.id))).toEqual(['线性代数', '  矩阵', '    转置', '      (AB)^T = B^T A^T', '      (A^T)^T = A']);
  });

  it('compresses a statement to its sentence, and leaves an item the user changed meanwhile', async () => {
    const long: RecordRequest = { itemType: 'statement', title: 'A square matrix is invertible iff its determinant is nonzero. That is because …', source: source() };
    const { r } = await recordAndPlace(long);
    expect((await repo.node(r.itemId)).title).toBe('A square matrix is invertible iff its determinant is nonzero.');

    const r2 = await recordItem(repo, { ...long, title: 'Transpose swaps rows and columns.', source: source('https://x.dev/2') }, labels);
    if (r2.status !== 'recorded') throw new Error('not recorded');
    // The user edits it while the model is still thinking.
    const client = stubClient();
    const answer = client.json;
    client.json = async (messages, parse) => {
      await repo.edit(r2.itemId, { title: 'Transpose: rows ↔ columns' });
      return answer(messages, parse);
    };
    const before = (await repo.pathOf(r2.itemId)).map((n) => n.id);
    expect(await placeItem(repo, client, '', { itemId: r2.itemId, group: r2.group, before: '', after: '', untitled: labels.newSubject, unplaced: labels.unplaced })).toBeNull();
    expect((await repo.pathOf(r2.itemId)).map((n) => n.id)).toEqual(before);
    expect((await repo.node(r2.itemId)).title).toBe('Transpose: rows ↔ columns');
  });

  it('offers the closest topics as candidates, with cached topic vectors, and the user’s corrections as examples', async () => {
    const client = stubClient();
    const { r } = await recordAndPlace(formula('(AB)^T = B^T A^T'), client, 'mock-embed');
    await recordAndPlace(formula('\\det(AB) = \\det A \\det B', 'https://x.dev/2'), client, 'mock-embed');
    const [subject] = await repo.listSubjects();
    const { node: other } = await repo.addSection(subject!.id, '迹');
    await repo.move(r.itemId, other.id);
    await repo.notePlacementChange(r.itemId, ['线性代数', '迹']);
    client.embedded.length = 0;
    await recordAndPlace(formula('\\det A^T = \\det A', 'https://x.dev/3'), client, 'mock-embed');
    const prompt = client.prompts.at(-1)!;
    expect(prompt).toMatch(/Candidates:\n- 线性代数 › (行列式|矩阵 › 转置|迹|矩阵)\n/);
    expect(prompt).toContain("The user's corrections:\n- (AB)^T = B^T A^T → 线性代数 › 迹");
    // Only the item and the topics whose text changed were embedded again.
    expect(client.embedded).not.toContain('线性代数 › 矩阵');
    expect(client.embedded[0]).toBe('\\det A^T = \\det A');
  });

  it('rejects malformed placements', () => {
    expect(() => parsePlacement({ subject: 'x', path: ['a', 'b', 'c', 'd'], statement: '' }, 'formula')).toThrow('1–3');
    expect(() => parsePlacement({ subject: '', path: ['a'], statement: '' }, 'formula')).toThrow('subject');
    expect(() => parsePlacement({ subject: 'x', path: ['a'], statement: '' }, 'statement')).toThrow('statement');
    expect(parsePlacement({ subject: 'x', path: ['a'], statement: 'ignored' }, 'formula').statement).toBe('');
  });
});
