import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { UserError } from '@/src/errors';
import { isGrey, itemCount, type MapTree } from '@/src/graph/tree';

let seq = 0;

function setup(name: string) {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  const db = new Chat2KnowDB(`${name}-${seq++}`);
  return { db, repo: new Repository(db, new Hlc('dev1', now), now) };
}

/** The tree as indented titles; items show their LaTeX, the unplaced group shows as [unplaced]. */
const outline = (t: MapTree, indent = ''): string[] => [
  `${indent}${t.node.role === 'unplaced' ? '[unplaced]' : t.node.latex ?? t.node.title}`,
  ...t.children.flatMap((c) => outline(c, `${indent}  `)),
];

const source = { url: 'https://chatgpt.com/c/1', pageTitle: 'Chat', quoteExact: 'x', quotePrefix: '', quoteSuffix: '', capturedAt: 1 };

describe('the map', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => ({ db, repo } = setup('map')));
  afterEach(() => db.delete());

  async function linearAlgebra() {
    const { node: subject } = await repo.addSubject('线性代数');
    const { node: matrix } = await repo.addSection(subject.id, '矩阵');
    const { node: transpose } = await repo.addSection(matrix.id, '转置');
    const { node: inverse } = await repo.addSection(matrix.id, '逆矩阵');
    const { node: f1 } = await repo.addItem({ parentId: transpose.id }, { itemType: 'formula', title: '', latex: '(AB)^T = B^T A^T', source });
    const { node: f2 } = await repo.addItem({ parentId: transpose.id }, { itemType: 'formula', title: '', latex: '(A^T)^T = A' });
    return { subject, matrix, transpose, inverse, f1, f2 };
  }

  it('builds a subject tree in order, with sources on items and grey derived', async () => {
    const { subject, matrix, transpose, inverse } = await linearAlgebra();
    await repo.addSection(matrix.id, '矩阵乘法', 'outline', transpose.id);
    const tree = await repo.subjectTree(subject.id);
    expect(outline(tree)).toEqual(['线性代数', '  矩阵', '    矩阵乘法', '    转置', '      (AB)^T = B^T A^T', '      (A^T)^T = A', '    逆矩阵']);
    expect(tree.children[0]!.children[1]!.children[0]!.node.source).toEqual(source);
    expect(itemCount(tree)).toBe(2);
    const [multiply, , inv] = tree.children[0]!.children;
    expect([isGrey(multiply!), isGrey(inv!), isGrey(tree)]).toEqual([true, true, false]);
    expect(inv!.node.id).toBe(inverse.id);
    expect((await repo.listSubjects()).map((s) => s.title)).toEqual(['线性代数']);
    expect((await repo.pathOf(transpose.id)).map((n) => n.title)).toEqual(['线性代数', '矩阵', '转置']);
  });

  it('puts unplaced items in one "待归位" group per subject', async () => {
    const { node: subject } = await repo.addSubject('线性代数');
    const a = await repo.addItem({ unplacedIn: subject.id }, { itemType: 'statement', title: 'det A ≠ 0 iff A is invertible' });
    const b = await repo.addItem({ unplacedIn: subject.id }, { itemType: 'formula', title: '', latex: 'A^{-1}A = I' });
    expect(a.node.parentId).toBe(b.node.parentId);
    expect(outline(await repo.subjectTree(subject.id))).toEqual(['线性代数', '  [unplaced]', '    det A ≠ 0 iff A is invertible', '    A^{-1}A = I']);
    // Undoing the first item also takes away the group it created.
    await repo.undo(b.group);
    await repo.undo(a.group);
    expect(outline(await repo.subjectTree(subject.id))).toEqual(['线性代数']);
  });

  it('moves nodes, within a subject and into another with the whole subtree', async () => {
    const { subject, matrix, transpose, inverse, f1, f2 } = await linearAlgebra();
    await repo.move(f2.id, transpose.id, f1.id);
    await repo.move(inverse.id, matrix.id, transpose.id);
    expect(outline(await repo.subjectTree(subject.id))).toEqual(['线性代数', '  矩阵', '    逆矩阵', '    转置', '      (A^T)^T = A', '      (AB)^T = B^T A^T']);

    const { node: other } = await repo.addSubject('矩阵分析');
    await repo.move(transpose.id, other.id);
    expect(outline(await repo.subjectTree(other.id))).toEqual(['矩阵分析', '  转置', '    (A^T)^T = A', '    (AB)^T = B^T A^T']);
    expect((await repo.node(f1.id)).subjectId).toBe(other.id);
  });

  it('refuses moves into a node itself, under an item, or deeper than 4 levels', async () => {
    const { subject, matrix, transpose, f1 } = await linearAlgebra();
    await expect(repo.move(matrix.id, transpose.id)).rejects.toThrow('into itself');
    await expect(repo.move(transpose.id, f1.id)).rejects.toThrow('Items have no children');
    const { node: deep } = await repo.addSection(transpose.id, '性质');
    await expect(repo.addSection(deep.id, 'too deep')).rejects.toBeInstanceOf(UserError);
    const { node: other } = await repo.addSection(subject.id, '其他');
    await expect(repo.move(other.id, deep.id)).rejects.toThrow('error.mapTooDeep');
    await expect(repo.move(subject.id, other.id)).rejects.toThrow('cannot be moved');
  });

  it('edits mark the text as the user’s own', async () => {
    const { f1 } = await linearAlgebra();
    await repo.edit(f1.id, { latex: '(AB)^\\top = B^\\top A^\\top' });
    expect(await repo.node(f1.id)).toMatchObject({ latex: '(AB)^\\top = B^\\top A^\\top', editedByUser: true });
  });

  it('merges a section into another', async () => {
    const { subject, matrix, transpose, inverse } = await linearAlgebra();
    await repo.addItem({ parentId: inverse.id }, { itemType: 'statement', title: '可逆当且仅当 det A ≠ 0' });
    await repo.mergeSections(transpose.id, inverse.id);
    expect(outline(await repo.subjectTree(subject.id))).toEqual(['线性代数', '  矩阵', '    逆矩阵', '      可逆当且仅当 det A ≠ 0', '      (AB)^T = B^T A^T', '      (A^T)^T = A']);
    await expect(repo.mergeSections(matrix.id, transpose.id)).rejects.toThrow('deleted');
  });

  it('deleting a section moves what is below it up into its place; restore puts it back', async () => {
    const { subject, matrix, transpose } = await linearAlgebra();
    await repo.addSection(subject.id, '行列式');
    await repo.remove(matrix.id);
    expect(outline(await repo.subjectTree(subject.id))).toEqual(['线性代数', '  转置', '    (AB)^T = B^T A^T', '    (A^T)^T = A', '  逆矩阵', '  行列式']);
    await repo.remove(transpose.id);
    await repo.restore(matrix.id);
    // The items moved again when 转置 was deleted; that later write stays.
    expect(outline(await repo.subjectTree(subject.id))).toEqual(['线性代数', '  矩阵', '    逆矩阵', '  (AB)^T = B^T A^T', '  (A^T)^T = A', '  行列式']);
    await expect(repo.restore(matrix.id)).rejects.toThrow('No deletion');
  });

  it('deleting a subject deletes its map; items are soft deleted', async () => {
    const { subject, f1 } = await linearAlgebra();
    await repo.remove(f1.id);
    expect((await repo.node(f1.id)).deletedAt).toBeDefined();
    await repo.remove(subject.id);
    expect(await repo.listSubjects()).toEqual([]);
    await expect(repo.subjectTree(subject.id)).rejects.toThrow('No subject');
    await repo.restore(subject.id);
    expect(outline(await repo.subjectTree(subject.id))).toHaveLength(5);
  });

  it('undoes every map write, latest first, and never undoes an undo', async () => {
    const { subject } = await linearAlgebra();
    const before = outline(await repo.subjectTree(subject.id));
    const { node: s } = await repo.addSection(subject.id, '行列式');
    await repo.edit(s.id, { title: '行列式与秩' });
    await repo.move(s.id, subject.id, (await repo.subjectTree(subject.id)).children[0]!.node.id);
    await repo.remove(s.id);
    for (let i = 0; i < 4; i++) expect(await repo.undo()).not.toBeNull();
    expect(outline(await repo.subjectTree(subject.id))).toEqual(before);
    expect(await db.nodes.get(s.id)).toBeUndefined();
    // Keeps going back through the earlier writes.
    await repo.undo();
    expect(outline(await repo.subjectTree(subject.id))).toEqual(before.filter((l) => !l.includes('(A^T)^T')));
  });

  it('undoing a group keeps nodes that changed since', async () => {
    const { subject, transpose } = await linearAlgebra();
    const added = await repo.addItem({ parentId: transpose.id }, { itemType: 'statement', title: 'Aᵀ swaps rows and columns' });
    await repo.edit(added.node.id, { title: 'Transpose swaps rows and columns' });
    await repo.undo(added.group);
    expect((await repo.node(added.node.id)).title).toBe('Transpose swaps rows and columns');
    expect(await repo.undo(added.group)).toBeNull();
    expect(itemCount(await repo.subjectTree(subject.id))).toBe(3);
  });

  it('logs every node write with its before and after row', async () => {
    const { node } = await repo.addSubject('线性代数');
    await repo.edit(node.id, { title: '线代' });
    const log = await db.oplog.orderBy('id').toArray();
    expect(log.map((e) => [e.action, e.before?.title ?? null, e.after?.title])).toEqual([
      ['addSubject', null, '线性代数'],
      ['edit', '线性代数', '线代'],
    ]);
    expect(log.map((e) => e.id)).toEqual(log.map((e) => e.after!.updatedAt));
  });
});

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
