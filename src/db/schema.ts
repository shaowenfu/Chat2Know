import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Ask, AskTag, Concept, Diagnosis, DiagnosisQuiz, Edge, Embedding, InboxItem, KNode, OpLogEntry, PrereqEdge, Preference, Review, Source } from './types';

export class Chat2KnowDB extends Dexie {
  nodes!: EntityTable<KNode, 'id'>;
  edges!: EntityTable<Edge, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  embeddings!: Table<Embedding, string>;
  oplog!: EntityTable<OpLogEntry, 'id'>;
  inbox!: EntityTable<InboxItem, 'id'>;
  preferences!: EntityTable<Preference, 'id'>;
  asks!: EntityTable<Ask, 'id'>;
  askTags!: EntityTable<AskTag, 'id'>;
  concepts!: EntityTable<Concept, 'id'>;
  prereqEdges!: EntityTable<PrereqEdge, 'id'>;
  diagnoses!: EntityTable<Diagnosis, 'id'>;
  quizzes!: EntityTable<DiagnosisQuiz, 'id'>;

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
    // v3: inbox items link back to their question node; reviews are read by time for stats.
    this.version(3).stores({ inbox: 'id, questionNodeId, createdAt, expiresAt', reviews: 'id, nodeId, dueAt, createdAt' });
    // v4: learning diagnosis, local only and not logged: recorded questions, their concept
    // tags, the prerequisite graph of concepts, and diagnoses.
    this.version(4).stores({
      asks: 'id, sentAt, conversationUrl',
      askTags: 'id, askId, conceptId',
      concepts: 'id, domain',
      prereqEdges: 'id, from, to',
      diagnoses: 'id, status, createdAt',
      quizzes: 'id, diagnosisId',
    });
  }
}
