import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Ask, AskTag, Embedding, Gap, MapNode, OpLogEntry, Placement, PrereqEdge } from './types';

/** The v2 database. A new name: v0.1 data comes in through import, never by upgrading its database. */
export class Chat2KnowDB extends Dexie {
  nodes!: EntityTable<MapNode, 'id'>;
  oplog!: EntityTable<OpLogEntry, 'id'>;
  placements!: EntityTable<Placement, 'id'>;
  embeddings!: Table<Embedding, string>;
  asks!: EntityTable<Ask, 'id'>;
  askTags!: EntityTable<AskTag, 'id'>;
  prereqEdges!: EntityTable<PrereqEdge, 'id'>;
  gaps!: EntityTable<Gap, 'id'>;

  constructor(name = 'chat2know-v2') {
    super(name);
    this.version(1).stores({
      nodes: 'id, subjectId, parentId, kind',
      oplog: 'id, group, entityId, undoes',
      placements: 'id, at',
      embeddings: 'nodeId',
      asks: 'id, sentAt, conversationUrl',
      askTags: 'id, askId, sectionId',
      prereqEdges: 'id, from, to',
      gaps: 'id, sectionId, status',
    });
  }
}
