/** subject › section (chapter, topic) › item. Subjects are roots; items are leaves. */
export type NodeKind = 'subject' | 'section' | 'item';
export type ItemType = 'formula' | 'statement';
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
 * A question the user sent on an AI site, recorded for gap detection.
 * Local only: not in the oplog, not in the default export.
 */
export interface Ask {
  id: string;
  site: string; // site config id, or the hostname for sites handled by the generic rule
  conversationUrl: string; // page URL without the hash; tells "same conversation" from "across conversations"
  text: string;
  sentAt: number;
  taggedAt?: number; // set once tagging has looked at it, even when it found nothing
  vector?: number[]; // embedding for circling detection, computed once per embedding model
  vectorModel?: string;
}

/** A recorded question is about this section node. Local only. */
export interface AskTag {
  id: string;
  askId: string;
  sectionId: string;
}

/** Section `from` must be understood before section `to`. Local only. */
export interface PrereqEdge {
  id: string;
  from: string;
  to: string;
}

export type GapStatus = 'suspected' | 'asked' | 'filled' | 'dismissed';

/** A possible gap on a section node (orange outline), from the user's own questions. Local only. */
export interface Gap {
  id: string;
  sectionId: string;
  evidenceAskIds: string[];
  signals: { kind: 'repeat' | 'downshift' | 'circling'; count: number }[];
  status: GapStatus;
  createdAt: number;
  coolDownUntil?: number;
}
