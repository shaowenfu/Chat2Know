import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { recordItem, type RecordRequest, type RecordResult } from '@/src/services/record';
import { normalizeLatex } from '@/src/graph/latex';

let seq = 0;
const labels = { unplaced: '待归位', unnamed: '未命名导图' };
const at = (url: string) => ({ url, pageTitle: 'Chat', quoteExact: 'q', quotePrefix: '', quoteSuffix: '', capturedAt: 1 });
const formula = (latex: string, url = 'https://chatgpt.com/c/1'): RecordRequest => ({ itemType: 'formula', title: '', latex, source: at(url) });
const recorded = (r: RecordResult) => {
  if (r.status !== 'recorded') throw new Error(`expected recorded, got ${r.status}`);
  return r;
};

describe('recording an item', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  let map: string;
  beforeEach(async () => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`record-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
    map = (await repo.addSubject('线性代数')).node.id;
  });
  afterEach(() => db.delete());

  it('stores nothing and creates no map when no map is open', async () => {
    expect(await recordItem(repo, undefined, formula('(AB)^T = B^T A^T'), labels)).toEqual({ status: 'noMap' });
    await repo.remove(map);
    expect(await recordItem(repo, map, formula('(AB)^T = B^T A^T'), labels)).toEqual({ status: 'noMap' });
    expect(await repo.listItems()).toEqual([]);
    expect(await repo.listSubjects()).toEqual([]);
  });

  it('goes into the open map’s 待归位 group; an unnamed map shows by its label; undo removes the item', async () => {
    const r = recorded(await recordItem(repo, map, formula('(AB)^T = B^T A^T'), labels));
    expect(r.path).toEqual(['线性代数', '待归位']);
    const unnamed = (await repo.addSubject('')).node.id;
    expect(recorded(await recordItem(repo, unnamed, formula('x^2', 'https://x.dev/1'), labels)).path).toEqual(['未命名导图', '待归位']);
    await repo.undo(r.group);
    expect((await repo.listItems()).map((i) => i.latex)).toEqual(['x^2']);
  });

  it('puts an item where the previous item of the same conversation went in this map, and never into another map', async () => {
    const first = recorded(await recordItem(repo, map, formula('(AB)^T = B^T A^T'), labels));
    const { node: transpose } = await repo.addSection(map, '转置');
    await repo.move(first.itemId, transpose.id);
    expect(recorded(await recordItem(repo, map, formula('(A^T)^T = A', 'https://chatgpt.com/c/1#reply'), labels)).path).toEqual(['线性代数', '转置']);
    const other = (await repo.addSubject('深度学习')).node.id;
    // Same conversation, but the user opened another map: it goes there.
    expect(recorded(await recordItem(repo, other, formula('\\mathrm{softmax}(z)'), labels)).path).toEqual(['深度学习', '待归位']);
  });

  it('does not add the same formula or statement twice in a map unless forced; another map may have it', async () => {
    await recordItem(repo, map, formula('(AB)^{T} = B^T A^T'), labels);
    expect(await recordItem(repo, map, formula('\\left(AB\\right)^{T}=B^T\\,A^T', 'https://claude.ai/chat/9'), labels)).toMatchObject({ status: 'duplicate', path: ['线性代数', '待归位'] });
    expect((await recordItem(repo, map, { ...formula('(AB)^{T} = B^T A^T'), force: true }, labels)).status).toBe('recorded');
    const other = (await repo.addSubject('矩阵分析')).node.id;
    expect((await recordItem(repo, other, formula('(AB)^{T} = B^T A^T'), labels)).status).toBe('recorded');
    const statement: RecordRequest = { itemType: 'statement', title: 'A is invertible iff det A ≠ 0.', source: at('https://chatgpt.com/c/1') };
    await recordItem(repo, map, statement, labels);
    expect((await recordItem(repo, map, { ...statement, title: 'a is invertible  iff det A ≠ 0' }, labels)).status).toBe('duplicate');
    expect(await repo.listItems()).toHaveLength(4);
  });

  it('normalizes LaTeX spacing only', () => {
    expect(normalizeLatex('\\displaystyle \\left( a \\, b \\right) \\quad c')).toBe('(ab)c');
    expect(normalizeLatex('\\leftarrow')).toBe('\\leftarrow');
  });
});
