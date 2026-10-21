import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Edge, Embedding, KNode, OpLogEntry, Review, Source } from './types';

export class Chat2KnowDB extends Dexie {
  nodes!: EntityTable<KNode, 'id'>;
  edges!: EntityTable<Edge, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  embeddings!: Table<Embedding, string>;
  oplog!: EntityTable<OpLogEntry, 'id'>;

  constructor(name = 'chat2know') {
    super(name);
    this.version(1).stores({
      nodes: 'id, type, status, createdAt',
      edges: 'id, from, to, kind',
      sources: 'id, nodeId, url, capturedAt',
      reviews: 'id, nodeId, dueAt',
      embeddings: 'nodeId',
      oplog: 'id, entity, entityId',
    });
  }
}
