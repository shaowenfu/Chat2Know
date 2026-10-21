export type NodeType = 'topic' | 'knowledge' | 'insight' | 'idea' | 'question';
export type NodeStatus = 'draft' | 'confirmed' | 'mastered';

export interface KNode {
  id: string; // ULID, sortable by time
  type: NodeType;
  title: string;
  summary?: string; // 1–3 sentence distillation, drafted by AI and confirmed by the user
  body?: string; // original Markdown, keeps formulas, code and tables
  status: NodeStatus; // `mastered` is only set by a passed review
  createdAt: number;
  updatedAt: string; // hybrid logical clock, for future conflict merging
  deletedAt?: number; // soft delete
}

export type EdgeKind = 'child' | 'related' | 'derived';

export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  order: string; // fractional index among siblings
}

export interface Source {
  id: string;
  nodeId: string;
  url: string;
  pageTitle: string;
  quoteExact: string;
  quotePrefix: string;
  quoteSuffix: string;
  capturedAt: number;
}

export interface Review {
  id: string;
  nodeId: string;
  mode: 'recall' | 'explain';
  prompt: string;
  answer: string;
  verdict: 'pass' | 'partial' | 'fail';
  feedback?: string;
  dueAt: number;
  interval: number;
  ease: number;
  createdAt: number;
}

export interface Embedding {
  nodeId: string;
  model: string;
  dim: number;
  vector: Float32Array;
}

export type Entity = 'nodes' | 'edges' | 'sources' | 'reviews';

export interface OpLogEntry {
  id: string; // HLC timestamp, totally ordered
  entity: Entity;
  entityId: string;
  op: 'put' | 'delete';
  patch: Record<string, unknown>;
}

/** A node as the side panel shows it. */
export interface NodeView extends KNode {
  sources: Source[];
}
