import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { EXPORT_FORMAT, EXPORT_VERSION, parseImport } from '@/src/export/json';
import type { MapTree } from '@/src/graph/tree';

let seq = 0;
const dbs: Chat2KnowDB[] = [];
function setup(device: string) {
  let t = 1_700_000_000_000;
  const now = () => (t += 1000);
  const db = new Chat2KnowDB(`transfer-${seq++}`);
  dbs.push(db);
  return new Repository(db, new Hlc(device, now), now);
}
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

/** A tree without write times, for comparing across databases. */
const shape = (t: MapTree): unknown => ({ ...t.node, updatedAt: undefined, children: t.children.map(shape) });
const exportText = async (repo: Repository) =>
  JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: 0, nodes: await repo.exportNodes() });

const source = { url: 'https://chatgpt.com/c/1', pageTitle: 'Chat', quoteExact: 'x', quotePrefix: 'a', quoteSuffix: 'b', capturedAt: 1 };

describe('JSON export and import', () => {
  it('round-trips a map losslessly, outline nodes and the unplaced group included', async () => {
    const a = setup('a');
    const { node: subject } = await a.addSubject('线性代数');
    const { node: matrix } = await a.addSection(subject.id, '矩阵');
    await a.addSection(matrix.id, '迹', 'outline');
    await a.addItem({ parentId: matrix.id }, { itemType: 'formula', title: '', latex: '(AB)^T = B^T A^T', source });
    await a.addItem({ unplacedIn: subject.id }, { itemType: 'statement', title: '可逆当且仅当 det A ≠ 0', request: '保留原句' });
    const { node: gone } = await a.addSection(subject.id, '删掉的');
    await a.remove(gone.id);

    const b = setup('b');
    const parsed = parseImport(await exportText(a));
    expect(parsed).toHaveLength(6);
    expect(parsed.find((n) => n.request)?.request).toBe('保留原句');
    await b.importNodes(parsed);
    expect(shape(await b.subjectTree(subject.id))).toEqual(shape(await a.subjectTree(subject.id)));

    // One undoable write.
    await b.undo();
    expect(await b.listSubjects()).toEqual([]);
  });

  it('rejects files that are not a valid export', async () => {
    const node = { id: 's', subjectId: 's', kind: 'subject', order: 'a0', title: 'x', origin: 'user', createdAt: 0, updatedAt: 'x' };
    const file = (nodes: unknown[], version = EXPORT_VERSION) => JSON.stringify({ format: EXPORT_FORMAT, version, exportedAt: 0, nodes });
    expect(() => parseImport('not json')).toThrow('error.notExport');
    expect(() => parseImport('{"format":"other"}')).toThrow('error.notExport');
    expect(() => parseImport(file([], 3))).toThrow('error.exportVersion');
    expect(() => parseImport(file([{ ...node, kind: 'card' }]))).toThrow('error.invalidExport');
    expect(() => parseImport(file([{ ...node, order: 'a00' }]))).toThrow('error.invalidExport');
    expect(() => parseImport(file([node, { ...node, id: 'i', kind: 'item', parentId: 'missing', itemType: 'formula' }]))).toThrow('error.invalidExport');
    expect(() => parseImport(file([node, { ...node, id: 'i', kind: 'section', parentId: 's', itemType: 'formula' }]))).toThrow('error.invalidExport');
    expect(() => parseImport(file([node, { ...node, id: 'i', kind: 'section', parentId: 's', request: 'x' }]))).toThrow('error.invalidExport');
    expect(parseImport(file([node]))).toEqual([node]);
  });
});
