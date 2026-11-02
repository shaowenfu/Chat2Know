import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { recordItem, type RecordRequest } from '@/src/services/record';
import { placeItem, placeUnplaced } from '@/src/services/placement';
import { parsePlacement } from '@/src/llm/prompts';
import type { ChatMessage } from '@/src/llm/client';
import { chatReply, mockEmbedding } from '../mock-llm/server';
import type { MapTree } from '@/src/graph/tree';

let seq = 0;
const labels = { unplaced: '待归位', unnamed: '未命名导图' };
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
  let map: string;
  beforeEach(async () => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`place-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
    map = (await repo.addSubject('')).node.id; // a map the user created without a name
  });
  afterEach(() => db.delete());

  async function recordAndPlace(req: RecordRequest, client = stubClient(), embeddingModel = '', into = map) {
    const r = await recordItem(repo, into, req, labels);
    if (r.status !== 'recorded') throw new Error('not recorded');
    const path = await placeItem(repo, client, embeddingModel, { itemId: r.itemId, group: r.group, before: 'b', after: 'a', lang: 'en', unplaced: labels.unplaced });
    return { r, path, client };
  }

  it('names an unnamed map once, adds the topic in it, and one undo takes the item and its place back', async () => {
    const { r, path, client } = await recordAndPlace(formula('(AB)^T = B^T A^T'));
    expect(path).toEqual(['线性代数', '矩阵', '转置']);
    expect(client.prompts[0]).toContain('Note (formula): (AB)^T = B^T A^T');
    expect(client.prompts[0]).toContain('Map: (unnamed)');
    expect(client.prompts[0]).toContain('Now in: 待归位');
    expect(outline(await repo.subjectTree(map))).toEqual(['线性代数', '  矩阵', '    转置', '      (AB)^T = B^T A^T']);
    // Named now: a note of another subject stays in this map, and the name stays.
    const { path: second } = await recordAndPlace(formula('\\mathrm{softmax}(z)_i', 'https://kimi.com/chat/3'));
    expect(second).toEqual(['线性代数', '注意力机制']);
    expect((await repo.listSubjects()).map((s) => s.title)).toEqual(['线性代数']);
    // Undoing the first record also takes back the name it gave the map.
    await repo.undo(r.group);
    expect(outline(await repo.subjectTree(map))).toEqual(['', '  注意力机制', '    \\mathrm{softmax}(z)_i']);
  });

  it('never renames a map the user named, and files into its existing topics', async () => {
    const named = (await repo.addSubject('我的线代笔记')).node.id;
    await recordAndPlace(formula('(AB)^T = B^T A^T'), stubClient(), '', named);
    const { path } = await recordAndPlace(formula('(A^T)^T = A', 'https://claude.ai/chat/2'), stubClient(), '', named);
    expect(path).toEqual(['我的线代笔记', '矩阵', '转置']);
    expect(outline(await repo.subjectTree(named))).toEqual(['我的线代笔记', '  矩阵', '    转置', '      (AB)^T = B^T A^T', '      (A^T)^T = A']);
  });

  it('compresses a statement to its sentence, and leaves an item the user changed meanwhile', async () => {
    const long: RecordRequest = { itemType: 'statement', title: 'A square matrix is invertible iff its determinant is nonzero. That is because …', source: source() };
    const { r } = await recordAndPlace(long);
    expect((await repo.node(r.itemId)).title).toBe('A square matrix is invertible iff its determinant is nonzero.');

    const r2 = await recordItem(repo, map, { ...long, title: 'Transpose swaps rows and columns.', source: source('https://x.dev/2') }, labels);
    if (r2.status !== 'recorded') throw new Error('not recorded');
    // The user edits it while the model is still thinking.
    const client = stubClient();
    const answer = client.json;
    client.json = async (messages, parse) => {
      await repo.edit(r2.itemId, { title: 'Transpose: rows ↔ columns' });
      return answer(messages, parse);
    };
    const before = (await repo.pathOf(r2.itemId)).map((n) => n.id);
    expect(await placeItem(repo, client, '', { itemId: r2.itemId, group: r2.group, before: '', after: '', lang: 'en', unplaced: labels.unplaced })).toBeNull();
    expect((await repo.pathOf(r2.itemId)).map((n) => n.id)).toEqual(before);
    expect((await repo.node(r2.itemId)).title).toBe('Transpose: rows ↔ columns');
  });

  it('offers the closest topics of this map as candidates, with cached vectors, and this map’s corrections as examples', async () => {
    const client = stubClient();
    const { r } = await recordAndPlace(formula('(AB)^T = B^T A^T'), client, 'mock-embed');
    await recordAndPlace(formula('\\det(AB) = \\det A \\det B', 'https://x.dev/2'), client, 'mock-embed');
    const { node: other } = await repo.addSection(map, '迹');
    await repo.move(r.itemId, other.id);
    await repo.notePlacementChange(r.itemId, ['线性代数', '迹']);
    client.embedded.length = 0;
    await recordAndPlace(formula('\\det A^T = \\det A', 'https://x.dev/3'), client, 'mock-embed');
    const prompt = client.prompts.at(-1)!;
    expect(prompt).toMatch(/Candidates:\n- (行列式|矩阵 › 转置|迹|矩阵)\n/);
    expect(prompt).toContain("The learner's corrections:\n- (AB)^T = B^T A^T → 迹");
    // Only the item and the topics whose text changed were embedded again.
    expect(client.embedded).not.toContain('矩阵');
    expect(client.embedded[0]).toBe('\\det A^T = \\det A');
  });

  it('writes the prompt in Chinese for a Chinese user', async () => {
    const client = stubClient();
    const r = await recordItem(repo, map, formula('(AB)^T = B^T A^T'), labels);
    if (r.status !== 'recorded') throw new Error('not recorded');
    await placeItem(repo, client, '', { itemId: r.itemId, before: '', after: '', lang: 'zh', unplaced: labels.unplaced });
    expect(client.prompts[0]).toContain('笔记 (公式): (AB)^T = B^T A^T');
    expect(client.prompts[0]).toContain('导图: （未命名）');
  });

  it('rejects malformed placements', () => {
    expect(() => parsePlacement({ path: ['a', 'b', 'c', 'd'], statement: '', mapName: '' }, 'formula', false)).toThrow('1–3');
    expect(() => parsePlacement({ path: ['a'], statement: '', mapName: '' }, 'formula', true)).toThrow('mapName');
    expect(() => parsePlacement({ path: ['a'], statement: '', mapName: '' }, 'statement', false)).toThrow('statement');
    expect(parsePlacement({ path: ['a'], statement: 'ignored', mapName: 'x' }, 'formula', false)).toEqual({ path: ['a'], statement: '', mapName: '' });
  });

  it('Ctrl+Z passes over the placements the extension made on its own', async () => {
    const { node: waiting } = await repo.addItem({ unplacedIn: map }, { itemType: 'formula', title: '', latex: '(AB)^T = B^T A^T' });
    const { node: topic } = await repo.addSection(map, '行列式');
    await placeUnplaced(repo, stubClient(), '', { lang: 'en', unplaced: labels.unplaced });
    expect((await repo.pathOf(waiting.id)).map((n) => n.title)).toEqual(['线性代数', '矩阵', '转置', '']);
    await repo.undo(); // the user's last own write: adding 行列式
    expect(await repo.find(topic.id)).toBeUndefined();
    expect((await repo.pathOf(waiting.id)).map((n) => n.title)).toEqual(['线性代数', '矩阵', '转置', '']);
  });
});
