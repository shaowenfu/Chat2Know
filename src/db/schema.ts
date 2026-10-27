import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Edge, Embedding, InboxItem, KNode, OpLogEntry, Preference, Review, Source } from './types';

export class Chat2KnowDB extends Dexie {
  nodes!: EntityTable<KNode, 'id'>;
  edges!: EntityTable<Edge, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  embeddings!: Table<Embedding, string>;
  oplog!: EntityTable<OpLogEntry, 'id'>;
  inbox!: EntityTable<InboxItem, 'id'>;
  preferences!: EntityTable<Preference, 'id'>;

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
    // v2: ask-later questions, mastery, temporary inbox and recording preferences.
    this.version(2)
      .stores({
        nodes: 'id, type, status, createdAt, term',
        inbox: 'id, createdAt, expiresAt',
        preferences: 'id, questionType, createdAt',
      })
      .upgrade((tx) =>
        tx
          .table('nodes')
          .toCollection()
          .modify((node: Partial<KNode>) => {
            node.askCount ??= 0;
          }),
      );
    // v3: inbox items link back to their question node.
    this.version(3).stores({ inbox: 'id, questionNodeId, createdAt, expiresAt' });
  }
}
