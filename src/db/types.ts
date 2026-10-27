export type NodeType = 'topic' | 'knowledge' | 'insight' | 'idea' | 'question';
export type NodeStatus = 'open' | 'draft' | 'confirmed' | 'mastered';
export type Mastery = 'internalize' | 'understand' | 'index';

export interface KNode {
  id: string; // ULID, sortable by time
  type: NodeType;
  title: string; // usually a question worth reviewing; may be empty for an ask-later with no question yet
  originalAsk?: string; // the question as the user first asked it, kept as the path of understanding
  term?: string; // for ask-later questions: the selected term the question is about
  summary?: string; // 1–3 sentence statement, drafted by AI and confirmed by the user
  body?: string; // original Markdown, keeps formulas, code and tables
  mastery?: Mastery; // chosen by the user (AI suggests from M4); not set for ideas and topics
  status: NodeStatus; // `open` = unresolved question; `mastered` is only set by a passed review
  askCount: number; // times this was asked later; repetition signals importance
  titleCandidates?: string[]; // AI-proposed question titles awaiting the user's pick (draft cards)
  distillError?: string; // last distillation failure, shown with a retry button
  createdAt: number;
  updatedAt: string; // hybrid logical clock, for future conflict merging
  deletedAt?: number; // soft delete
}

export type EdgeKind = 'child' | 'arose_from' | 'instance_of' | 'related' | 'derived';

/**
 * Tree edges point from parent (`from`) to child (`to`); `kind` says how the
 * child relates to the parent: a plain child, a question that arose from the
 * parent's answer, or an instance of the parent concept. A node has at most
 * one incoming tree edge.
 */
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

/** Temporary inbox: answers to ask-now / ask-later live here until the user keeps them. Not synced. */
export interface InboxItem {
  id: string;
  questionNodeId: string;
  question: string;
  quote: string;
  answer: string;
  parentNodeId?: string;
  createdAt: number;
  expiresAt: number;
  promotedNodeId?: string;
}

/** The user's accept / edit / delete decisions on recording suggestions, used as few-shot examples. */
export interface Preference {
  id: string;
  questionType: 'concept' | 'instance' | 'curiosity';
  suggestion: string;
  userAction: 'accept' | 'edit' | 'delete';
  finalText?: string;
  createdAt: number;
}

export interface Embedding {
  nodeId: string;
  model: string;
  dim: number;
  vector: Float32Array;
}

export type Entity = 'nodes' | 'edges' | 'sources' | 'reviews' | 'preferences';

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
