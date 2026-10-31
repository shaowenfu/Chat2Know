import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { moveByUser, parentPath, placeOptions, searchPlaces } from '@/src/services/relocate';
import { mockEmbedding } from '../mock-llm/server';

let seq = 0;

describe('改位置', () => {
  let db: Chat2KnowDB;
  let repo: Repository;
  let ids: Record<string, string>;
  beforeEach(async () => {
    let t = 1_700_000_000_000;
    const now = () => (t += 1000);
    db = new Chat2KnowDB(`relocate-${seq++}`);
    repo = new Repository(db, new Hlc('d', now), now);
    const { node: la } = await repo.addSubject('线性代数');
    const { node: matrix } = await repo.addSection(la.id, '矩阵');
    const { node: transpose } = await repo.addSection(matrix.id, '转置');
    const { node: trace } = await repo.addSection(matrix.id, '迹');
    const { node: det } = await repo.addSection(la.id, '行列式');
    await repo.addItem({ parentId: trace.id }, { itemType: 'formula', title: '', latex: '\\mathrm{tr}(AB) = \\mathrm{tr}(BA)' });
    await repo.addItem({ parentId: det.id }, { itemType: 'formula', title: '', latex: '\\det(AB) = \\det A \\det B' });
    const { node: item } = await repo.addItem({ unplacedIn: la.id }, { itemType: 'formula', title: '', latex: '\\det A^T = \\det A' });
    ids = { la: la.id, matrix: matrix.id, transpose: transpose.id, trace: trace.id, det: det.id, item: item.id };
  });
  afterEach(() => db.delete());

  it('offers the topics recorded into last without vectors, the closest ones with them', async () => {
    expect((await placeOptions(repo, null, '', ids.item!)).map((p) => p.path)).toEqual([
      ['线性代数', '行列式'],
      ['线性代数', '矩阵', '迹'],
    ]);
    const client = { embed: async (texts: string[]) => texts.map(mockEmbedding) };
    const places = await placeOptions(repo, client, 'mock-embed', ids.item!);
    expect(places).toHaveLength(3);
    expect(places[0]!.path).toEqual(['线性代数', '行列式']);
  });

  it('searches topics by title', async () => {
    expect((await searchPlaces(repo, '转')).map((p) => p.path)).toEqual([['线性代数', '矩阵', '转置']]);
    expect(await searchPlaces(repo, '  ')).toEqual([]);
  });

  it('moves where the user says, into a new topic beside a topic or under a chapter, as examples once placed', async () => {
    await repo.notePlacement(ids.item!, ['线性代数', '待归位']);
    expect((await moveByUser(repo, ids.item!, { placeId: ids.det! }, '待归位')).path).toEqual(['线性代数', '行列式']);
    expect(await repo.placementExamples(20)).toEqual([{ text: '\\det A^T = \\det A', path: ['线性代数', '行列式'] }]);

    expect((await moveByUser(repo, ids.item!, { placeId: ids.trace!, newTopic: '转置的性质' }, '待归位')).path).toEqual(['线性代数', '矩阵', '转置的性质']);
    expect((await moveByUser(repo, ids.item!, { placeId: ids.matrix!, newTopic: '行列式与转置' }, '待归位')).path).toEqual(['线性代数', '矩阵', '行列式与转置']);
    const { group } = await moveByUser(repo, ids.item!, { placeId: ids.det!, newTopic: '性质' }, '待归位');
    expect(await parentPath(repo, ids.item!, '待归位')).toEqual(['线性代数', '行列式', '性质']);
    await repo.undo(group);
    expect(await parentPath(repo, ids.item!, '待归位')).toEqual(['线性代数', '矩阵', '行列式与转置']);
    expect(await searchPlaces(repo, '性质')).toEqual([{ id: expect.any(String), path: ['线性代数', '矩阵', '转置的性质'] }]);
  });
});
