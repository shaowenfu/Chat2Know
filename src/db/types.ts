/** subject › section (chapter, topic) › item. Subjects are roots; items are leaves. */
export type NodeKind = 'subject' | 'section' | 'item';
/** A formula (LaTeX), a statement (one sentence), or a protected quote (the user's selection word for word, only the user edits it). */
export type ItemType = 'formula' | 'statement' | 'quote';
/** Who put the node on the map: the user (solid), the extension with consent (light blue dashed), an outline (grey dashed). */
export type Origin = 'user' | 'plugin' | 'outline';

/** Where an item came from; jumps back to the conversation. */
export interface ItemSource {
  url: string;
  pageTitle: string;
  quoteExact: string;
  quotePrefix: string;
  quoteSuffix: string;
  capturedAt: number;
}

/**
 * One node of a subject's map. The tree lives on the nodes themselves: every node
 * but a subject has one parent, ordered among its siblings by a fractional index.
 * "Grey" (nothing learned below) is derived, never stored.
 */
export interface MapNode {
  id: string; // ULID
  subjectId: string; // a subject's own id for the subject itself
  kind: NodeKind;
  parentId?: string; // absent only on subjects
  order: string; // fractional index among siblings
  title: string; // structure: a noun; statement: the one sentence; formula: may be empty
  itemType?: ItemType; // items only
  latex?: string; // formula items: kept verbatim
  source?: ItemSource; // items the user recorded
  request?: string; // how the user asked for this note to be written ("记下" with a request); placement follows it
  origin: Origin;
  /** The subject's "待归位" group: where items wait for automatic placement. Titled by the UI. */
  role?: 'unplaced';
  editedByUser?: boolean; // once the user edits the text, the extension never rewrites it
  createdAt: number;
  updatedAt: string; // HLC of the last write
  deletedAt?: number; // soft delete
}

/**
 * One node write. Every map write is a group of entries sharing `group`; undo
 * reverts a group. `before` / `after` are whole rows (`null`: did not exist).
 */
export interface OpLogEntry {
  id: string; // HLC, totally ordered
  group: string;
  action: string; // the repository method, for display ("undo move")
  entityId: string;
  before: MapNode | null;
  after: MapNode | null;
  undoes?: string; // set on the entries of an undo: the group it reverted
}

/** Where automatic placement put an item and where it ended up; the user's corrections are placement examples. */
export interface Placement {
  id: string; // the item id
  suggestedPath: string[];
  finalPath: string[];
  changedByUser: boolean;
  at: number;
}

/** Cached embedding of a node's text; recomputed when the model or the text changes. */
export interface Embedding {
  nodeId: string;
  model: string;
  text: string;
  vector: number[];
}

/**
 * A question the user sent: on an AI site, or in the floating window about a
 * selection. It belongs to the map that was open when it was sent (none if no map
 * was open). Local only: not in the oplog, not in the default export.
 */
export interface Ask {
  id: string;
  site: string; // site config id, or the hostname for sites handled by the generic rule
  conversationUrl: string; // page URL without the hash; tells conversations apart
  text: string;
  sentAt: number;
  mapId?: string;
  via: 'site' | 'window';
}

export type StuckKind = 'circling' | 'stuck' | 'offTarget' | 'phrasing';

/**
 * One look at a map's latest questions, made every 5 new ones. When the model saw
 * the learner stuck, the side panel shows a card and its topic is marked orange
 * until "不用" (which also keeps the map quiet for the rest of the day) or the next
 * check. Local only.
 */
export interface StuckCheck {
  id: string;
  mapId: string;
  checkedAt: number;
  throughSentAt: number; // the newest question it read; the next check waits for 5 after it
  askIds: string[]; // the questions it read, oldest first
  stuck: boolean;
  kind?: StuckKind;
  sectionId?: string;
  explanation?: string;
  betterQuestion?: string;
  evidenceAskIds?: string[];
  dismissedAt?: number;
}

/**
 * A written analysis of one map's questions, made only when the user asks for it.
 * Markdown (simple HTML allowed), shown sanitized. Older ones stay as history. Local only.
 */
export interface Report {
  id: string;
  mapId: string;
  createdAt: number;
  markdown: string;
  askCount: number; // how many questions it read
}
