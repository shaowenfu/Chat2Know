import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Ask, Embedding, MapNode, OpLogEntry, Placement, StuckCheck } from './types';

/** The v2 database. A new name: v0.1 data comes in through import, never by upgrading its database. */
export class Chat2KnowDB extends Dexie {
  nodes!: EntityTable<MapNode, 'id'>;
  oplog!: EntityTable<OpLogEntry, 'id'>;
  placements!: EntityTable<Placement, 'id'>;
  embeddings!: Table<Embedding, string>;
  asks!: EntityTable<Ask, 'id'>;
  stuckChecks!: EntityTable<StuckCheck, 'id'>;

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
    // S3: questions belong to the open map and a check every 5 replaces the gap flow.
    this.version(2).stores({
      asks: 'id, sentAt, conversationUrl, mapId',
      askTags: null,
      prereqEdges: null,
      gaps: null,
      stuckChecks: 'id, mapId, checkedAt',
    });
  }
}
