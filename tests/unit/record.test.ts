import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { recordItem, type RecordRequest } from '@/src/services/record';
import { normalizeLatex } from '@/src/graph/latex';

let seq = 0;
const labels = { unplaced: '待归位', newSubject: '未命名学科' };
const at = (url: string) => ({ url, pageTitle: 'Chat', quoteExact: 'q', quotePrefix: '', quoteSuffix: '', capturedAt: 1 });
const formula = (latex: string, url = 'https://chatgpt.com/c/1'): RecordRequest => ({ itemType: 'formula', title: '', latex, source: at(url) });

describe('recording an item', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`record-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
  });
  afterEach(() => db.delete());

  it('starts a new subject’s 待归位 group; undo leaves nothing behind', async () => {
    const r = await recordItem(repo, formula('(AB)^T = B^T A^T'), labels);
    expect(r).toMatchObject({ status: 'recorded', path: ['未命名学科', '待归位'] });
    await repo.undo(r.status === 'recorded' ? r.group : '');
    expect(await repo.listSubjects()).toEqual([]);
  });

  it('puts an item where the previous item of the same conversation went', async () => {
    const first = await recordItem(repo, formula('(AB)^T = B^T A^T'), labels);
    const [subject] = await repo.listSubjects();
    const { node: transpose } = await repo.addSection(subject!.id, '转置');
    await repo.move(first.itemId, transpose.id);
    expect((await recordItem(repo, formula('(A^T)^T = A', 'https://chatgpt.com/c/1#reply'), labels)).path).toEqual(['未命名学科', '转置']);
    // Another conversation goes to the 待归位 group of the subject recorded into last.
    expect((await recordItem(repo, formula('\\det A^T = \\det A', 'https://claude.ai/chat/2'), labels)).path).toEqual(['未命名学科', '待归位']);
  });

  it('does not add the same formula or statement twice unless forced', async () => {
    await recordItem(repo, formula('(AB)^{T} = B^T A^T'), labels);
    expect(await recordItem(repo, formula('\\left(AB\\right)^{T}=B^T\\,A^T', 'https://claude.ai/chat/9'), labels)).toMatchObject({ status: 'duplicate', path: ['未命名学科', '待归位'] });
    expect((await recordItem(repo, { ...formula('(AB)^{T} = B^T A^T'), force: true }, labels)).status).toBe('recorded');
    const statement: RecordRequest = { itemType: 'statement', title: 'A is invertible iff det A ≠ 0.', source: at('https://chatgpt.com/c/1') };
    await recordItem(repo, statement, labels);
    expect((await recordItem(repo, { ...statement, title: 'a is invertible  iff det A ≠ 0' }, labels)).status).toBe('duplicate');
    expect(await repo.listItems()).toHaveLength(3);
  });

  it('normalizes LaTeX spacing only', () => {
    expect(normalizeLatex('\\displaystyle \\left( a \\, b \\right) \\quad c')).toBe('(ab)c');
    expect(normalizeLatex('\\leftarrow')).toBe('\\leftarrow');
  });
});
