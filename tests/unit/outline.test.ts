import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { parseOutline } from '@/src/llm/prompts';
import { outlineOfferable, proposeOutline } from '@/src/services/outline';
import { isGrey, type MapTree } from '@/src/graph/tree';
import type { ChatMessage } from '@/src/llm/client';
import { chatReply } from '../mock-llm/server';

let seq = 0;
const outline = (t: MapTree, indent = ''): string[] => [
  `${indent}${t.node.latex ?? t.node.title}${t.node.kind !== 'item' && isGrey(t) ? ' (grey)' : ''}`,
  ...t.children.flatMap((c) => outline(c, `${indent}  `)),
];
const stub = {
  json: async <T>(messages: ChatMessage[], parse: (v: unknown) => T) => parse(JSON.parse(chatReply('outline', messages[1]!.content))),
};

describe('laying an outline', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  beforeEach(() => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`outline-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
  });
  afterEach(() => db.delete());

  it('adds grey sections, reuses the user’s own by title (moving one into place), adds no items, and undoes in one step', async () => {
    const { node: s } = await repo.addSubject('线性代数');
    const { node: t } = await repo.addSection(s.id, '转置'); // placed at the top level, belongs under 矩阵
    await repo.addItem({ parentId: t.id }, { itemType: 'formula', title: '', latex: '(AB)^T = B^T A^T' });
    expect(outlineOfferable(await repo.subjectTree(s.id))).toBe(true);
    const group = await repo.layOutline(s.id, await proposeOutline(repo, stub, s.id, 'zh'));
    const tree = await repo.subjectTree(s.id);
    expect(outline(tree)).toEqual([
      '线性代数',
      '  向量与向量空间 (grey)',
      '  矩阵',
      '    矩阵乘法 (grey)',
      '    转置',
      '      (AB)^T = B^T A^T',
      '    逆矩阵 (grey)',
      '    秩 (grey)',
      '  行列式 (grey)',
      '  线性方程组 (grey)',
      '  特征值与特征向量 (grey)',
      '  二次型 (grey)',
    ]);
    expect((await repo.node(t.id)).origin).toBe('user');
    expect(outlineOfferable(tree)).toBe(false);
    await repo.undo(group);
    expect(outline(await repo.subjectTree(s.id))).toEqual(['线性代数', '  转置', '    (AB)^T = B^T A^T']);
  });

  it('turns a pasted table of contents into the outline', async () => {
    const { node: s } = await repo.addSubject('线性代数');
    const toc = await proposeOutline(repo, stub, s.id, 'zh', '1 行列式\n  1.1 排列\n2 矩阵\n  2.1 逆矩阵');
    expect(toc).toEqual([
      { title: '行列式', children: [{ title: '排列', children: [] }] },
      { title: '矩阵', children: [{ title: '逆矩阵', children: [] }] },
    ]);
  });

  it('rejects outlines that are empty, too deep or untitled', () => {
    const deep = { title: 'a', children: [{ title: 'b', children: [{ title: 'c', children: [{ title: 'd', children: [] }] }] }] };
    expect(() => parseOutline({ outline: [] }, 'x')).toThrow('empty');
    expect(() => parseOutline({ outline: [deep] }, 'x')).toThrow('deeper');
    expect(() => parseOutline({ outline: [{ title: '' }] }, 'x')).toThrow('title');
    expect(parseOutline({ outline: [{ title: 'a' }] }, 'x')).toEqual([{ title: 'a', children: [] }]);
  });

  it('rejects a generic template and titles in another language than the map name', () => {
    // What a real model once returned for 高等数学.
    const template = ['Overview', 'Foundations', 'Core Topics', 'Methods', 'Applications'].map((title) => ({ title, children: [{ title: 'Scope' }, { title: 'History' }] }));
    expect(() => parseOutline({ outline: template }, 'Calculus')).toThrow('generic template');
    expect(() => parseOutline({ outline: [{ title: 'Limits' }, { title: 'Derivatives' }] }, '高等数学')).toThrow('not in the language');
    expect(() => parseOutline({ outline: [{ title: '极限' }, { title: '导数' }] }, 'Calculus')).toThrow('not in the language');
    expect(parseOutline({ outline: [{ title: '极限与连续', children: [{ title: '概述' }, { title: '数列极限' }, { title: '函数极限' }] }] }, '高等数学')).toHaveLength(1);
  });
});
