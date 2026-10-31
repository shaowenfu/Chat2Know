import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { monotonicFactory } from 'ulid';
import { UserError } from '@/src/errors';
import { buildTree, byOrder, type MapTree } from '@/src/graph/tree';
import type { Hlc } from './hlc';
import type { Chat2KnowDB } from './schema';
import type { Ask, Embedding, ItemSource, ItemType, MapNode, Origin } from './types';

const stripHash = (url: string) => url.replace(/#.*$/, '');

/** Subject + 3 levels of sections. */
export const MAX_DEPTH = 4;

export interface ItemInput {
  itemType: ItemType;
  title: string;
  latex?: string;
  source?: ItemSource;
  origin?: Origin;
}

/** Where a new item goes: under a structure node, or in the "待归位" group (created when missing) of a subject or of a new subject. */
export type ItemPlace = { parentId: string } | { unplacedIn: string } | { newSubject: string };

/** A map write: its oplog group (to undo exactly this) and the node it is about. */
export interface Written {
  group: string;
  node: MapNode;
}

type NewNode = Omit<MapNode, 'id' | 'createdAt' | 'updatedAt'>;

/** Writes of one group: every node write is logged with its whole before and after row. */
interface Writer {
  readonly group: string;
  put(node: MapNode): Promise<MapNode>;
  create(node: NewNode): Promise<MapNode>;
  drop(id: string): Promise<void>;
  /** An entry about no node: an undo is logged even when every node had changed since. */
  mark(): Promise<void>;
}

/** Whole rows compared without their write time: an undo restores content under a new time. */
function sameRow(a: MapNode | null, b: MapNode | null): boolean {
  const content = (n: MapNode | null) => (n ? JSON.stringify(Object.entries({ ...n, updatedAt: '' }).sort(([x], [y]) => (x < y ? -1 : 1))) : null);
  return content(a) === content(b);
}

/** The only write path to the database. Map writes are logged to the oplog and can be undone. */
export class Repository {
  private readonly ulid = monotonicFactory();

  constructor(
    private readonly db: Chat2KnowDB,
    readonly clock: Hlc,
    private readonly now: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------ reading the map

  async listSubjects(): Promise<MapNode[]> {
    return (await this.db.nodes.where('kind').equals('subject').toArray()).filter((n) => !n.deletedAt).sort(byOrder);
  }

  /** Every live item, of every subject. */
  async listItems(): Promise<MapNode[]> {
    return (await this.db.nodes.where('kind').equals('item').toArray()).filter((n) => !n.deletedAt);
  }

  /** A node that may have been undone away. */
  async find(id: string): Promise<MapNode | undefined> {
    return this.db.nodes.get(id);
  }

  async node(id: string): Promise<MapNode> {
    const n = await this.db.nodes.get(id);
    if (!n) throw new Error(`No node ${id}`);
    return n;
  }

  /** A subject's live map as a tree. */
  async subjectTree(subjectId: string): Promise<MapTree> {
    const nodes = await this.subjectNodes(subjectId);
    const root = buildTree(nodes).find((t) => t.node.id === subjectId);
    if (!root) throw new Error(`No subject ${subjectId}`);
    return root;
  }

  /** All of a subject's live nodes, unordered. */
  async subjectNodes(subjectId: string): Promise<MapNode[]> {
    return (await this.db.nodes.where('subjectId').equals(subjectId).toArray()).filter((n) => !n.deletedAt);
  }

  /** Root first. */
  async pathOf(id: string): Promise<MapNode[]> {
    const path: MapNode[] = [];
    for (let n: MapNode | undefined = await this.node(id); n; n = n.parentId ? await this.node(n.parentId) : undefined) path.unshift(n);
    return path;
  }

  // ------------------------------------------------------------ map writes (logged, undoable)

  async addSubject(title: string, origin: Origin = 'user'): Promise<Written> {
    return this.write('addSubject', (w) => this.createSubject(w, title, origin));
  }

  async addSection(parentId: string, title: string, origin: Origin = 'user', beforeId?: string): Promise<Written> {
    return this.write('addSection', async (w) => {
      const parent = await this.structure(parentId);
      if ((await this.depthOf(parent)) + 1 > MAX_DEPTH) throw new UserError('error.mapTooDeep');
      const order = await this.orderAt(parent.id, beforeId);
      return w.create({ subjectId: parent.subjectId, kind: 'section', parentId: parent.id, order, title: title.trim(), origin });
    });
  }

  async addItem(place: ItemPlace, input: ItemInput): Promise<Written> {
    return this.write('addItem', async (w) => {
      const parent =
        'parentId' in place
          ? await this.structure(place.parentId)
          : await this.unplacedGroup(w, 'unplacedIn' in place ? place.unplacedIn : (await this.createSubject(w, place.newSubject, 'user')).id);
      return w.create(this.newItem(parent, input, await this.orderAt(parent.id)));
    });
  }

  /** Moves a node under `parentId`, before the sibling `beforeId` or last. Moving to another subject takes the subtree along. */
  async move(id: string, parentId: string, beforeId?: string): Promise<string> {
    return this.group('move', async (w) => {
      const node = await this.live(id);
      if (node.kind === 'subject') throw new Error('A subject cannot be moved');
      const parent = await this.structure(parentId);
      await this.placeUnder(w, node, parent, await this.orderAt(parent.id, beforeId, id));
    });
  }

  /** Moves a node into a new section titled `title` under `parentId`, as one write. */
  async moveToNewSection(id: string, parentId: string, title: string): Promise<string> {
    return this.group('moveToNewSection', async (w) => {
      const node = await this.live(id);
      const parent = await this.structure(parentId);
      if ((await this.depthOf(parent)) + 1 > MAX_DEPTH) throw new UserError('error.mapTooDeep');
      const section = await w.create({ subjectId: parent.subjectId, kind: 'section', parentId: parent.id, order: await this.orderAt(parent.id), title: title.trim(), origin: 'user' });
      await this.placeUnder(w, node, section, generateKeyBetween(null, null));
    });
  }

  /** The user's own text; from now on the extension never rewrites it. */
  async edit(id: string, patch: { title?: string; latex?: string }): Promise<string> {
    return this.group('edit', async (w) => {
      const node = await this.live(id);
      await w.put({
        ...node,
        ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
        ...(patch.latex === undefined ? {} : { latex: patch.latex }),
        editedByUser: true,
      });
    });
  }

  /** Moves everything under `fromId` to the end of `intoId` and deletes `fromId`. */
  async mergeSections(fromId: string, intoId: string): Promise<string> {
    return this.group('mergeSections', async (w) => {
      const from = await this.live(fromId);
      const into = await this.structure(intoId);
      if (from.kind !== 'section' || into.kind !== 'section') throw new Error('Only sections are merged');
      const children = await this.children(from.id);
      const keys = generateNKeysBetween((await this.children(into.id)).at(-1)?.order ?? null, null, children.length);
      for (const [i, child] of children.entries()) await this.placeUnder(w, child, into, keys[i]!);
      await w.put({ ...from, deletedAt: this.now() });
    });
  }

  /**
   * Soft delete. A section's children move up into its place; a subject goes with
   * its whole map. Undo or `restore` brings it back.
   */
  async remove(id: string): Promise<string> {
    return this.group('remove', async (w) => {
      const node = await this.live(id);
      const at = this.now();
      if (node.kind === 'subject') {
        for (const n of await this.db.nodes.where('subjectId').equals(id).toArray()) if (!n.deletedAt) await w.put({ ...n, deletedAt: at });
        return;
      }
      if (node.kind === 'section') {
        const siblings = await this.children(node.parentId!);
        const next = siblings[siblings.findIndex((s) => s.id === id) + 1];
        const children = await this.children(id);
        const keys = generateNKeysBetween(node.order, next?.order ?? null, children.length);
        for (const [i, child] of children.entries()) await w.put({ ...child, parentId: node.parentId!, order: keys[i]! });
      }
      await w.put({ ...node, deletedAt: at });
    });
  }

  /** Undoes the latest deletion of `id` (and what moved with it). */
  async restore(id: string): Promise<string> {
    const entries = await this.db.oplog.where('entityId').equals(id).reverse().sortBy('id');
    for (const e of entries) {
      if (e.undoes || !e.after?.deletedAt || e.before?.deletedAt) continue;
      if (!(await this.isUndone(e.group))) return (await this.undo(e.group))!;
    }
    throw new Error(`No deletion of ${id} to restore`);
  }

  /**
   * Reverts a group (default: the latest one not undone yet). A node changed by a
   * later write keeps that change. Returns the undo's own group, or null when there
   * was nothing to undo.
   */
  async undo(group?: string): Promise<string | null> {
    const target = group ?? (await this.latestUndoable());
    if (!target || (await this.isUndone(target))) return null;
    return this.group(
      'undo',
      async (w) => {
        const entries = await this.db.oplog.where('group').equals(target).sortBy('id');
        if (!entries.length) throw new Error(`No group ${target}`);
        const first = new Map<string, MapNode | null>();
        const last = new Map<string, MapNode | null>();
        for (const e of entries) {
          if (!first.has(e.entityId)) first.set(e.entityId, e.before);
          last.set(e.entityId, e.after);
        }
        for (const [id, before] of first) {
          if (!sameRow((await this.db.nodes.get(id)) ?? null, last.get(id)!)) continue;
          if (before) await w.put(before);
          else await w.drop(id);
        }
        await w.mark();
      },
      target,
    );
  }

  /**
   * Files an item under `subject › path` by titles, creating the subject and sections
   * that are missing (an untouched "untitled" subject the item is in takes the new
   * subject's name instead). A statement takes the one-sentence form unless the user
   * edited it. Emptied 待归位 groups and untitled subjects go. Joins `group` when given.
   * Returns the item's new path, or null (nothing written) when the item is gone or
   * was written since `seen` (its updatedAt then): the user's later action wins.
   */
  async fileItem(
    itemId: string,
    seen: string,
    place: { subject: string; path: string[]; statement?: string; untitled: string },
    group?: string,
  ): Promise<MapNode[] | null> {
    let filed = false;
    await this.group(
      'fileItem',
      async (w) => {
        const item = await this.db.nodes.get(itemId);
        if (!item || item.deletedAt || item.updatedAt !== seen) return;
        if (item.kind !== 'item') throw new Error(`${itemId} is not an item`);
        filed = true;
        const key = (t: string) => t.trim().toLowerCase();
        const current = await this.node(item.subjectId);
        const isUntitled = (n: MapNode) => n.title === place.untitled && !n.editedByUser;
        let subject = (await this.listSubjects()).find((s) => key(s.title) === key(place.subject));
        if (!subject && isUntitled(current)) subject = await w.put({ ...current, title: place.subject.trim() });
        subject ??= await this.createSubject(w, place.subject, 'user');
        let parent = subject;
        for (const title of place.path) {
          const found = (await this.children(parent.id)).find((c) => c.kind === 'section' && !c.role && key(c.title) === key(title));
          parent =
            found ??
            (await w.create({ subjectId: subject.id, kind: 'section', parentId: parent.id, order: await this.orderAt(parent.id), title: title.trim(), origin: 'user' }));
        }
        const oldParent = await this.node(item.parentId!);
        let next = item;
        if (parent.id !== item.parentId) {
          await this.placeUnder(w, item, parent, await this.orderAt(parent.id));
          next = await this.node(itemId);
        }
        if (place.statement && item.itemType === 'statement' && !item.editedByUser && place.statement !== item.title) {
          await w.put({ ...next, title: place.statement.trim() });
        }
        if (oldParent.role === 'unplaced' && !(await this.children(oldParent.id)).length) await w.put({ ...oldParent, deletedAt: this.now() });
        const old = await this.node(current.id);
        if (old.id !== subject.id && isUntitled(old) && !(await this.subjectNodes(old.id)).some((n) => n.kind === 'item')) {
          for (const n of await this.subjectNodes(old.id)) await w.put({ ...n, deletedAt: this.now() });
        }
      },
      undefined,
      group,
    );
    return filed ? this.pathOf(itemId) : null;
  }

  // ------------------------------------------------------------ placements and embeddings (not logged)

  async notePlacement(itemId: string, suggestedPath: string[]): Promise<void> {
    await this.db.placements.put({ id: itemId, suggestedPath, finalPath: suggestedPath, changedByUser: false, at: this.now() });
  }

  /** The user moved an item the extension had placed: its final path becomes a placement example. */
  async notePlacementChange(itemId: string, finalPath: string[]): Promise<void> {
    if (await this.db.placements.get(itemId)) await this.db.placements.update(itemId, { finalPath, changedByUser: true, at: this.now() });
  }

  /** The latest placements the user corrected, with the items' text, newest first. */
  async placementExamples(limit: number): Promise<{ text: string; path: string[] }[]> {
    const rows = (await this.db.placements.orderBy('at').reverse().toArray()).filter((p) => p.changedByUser);
    const out: { text: string; path: string[] }[] = [];
    for (const p of rows) {
      const n = await this.db.nodes.get(p.id);
      if (n && !n.deletedAt) out.push({ text: n.latex ?? n.title, path: p.finalPath });
      if (out.length === limit) break;
    }
    return out;
  }

  async embeddings(nodeIds: string[]): Promise<Map<string, Embedding>> {
    const rows = await this.db.embeddings.bulkGet(nodeIds);
    return new Map(rows.filter((r): r is Embedding => r !== undefined).map((r) => [r.nodeId, r]));
  }

  async putEmbeddings(rows: Embedding[]): Promise<void> {
    await this.db.embeddings.bulkPut(rows);
  }

  // ------------------------------------------------------------ export and import

  /** Every live map node: the lossless JSON export. */
  async exportNodes(): Promise<MapNode[]> {
    return (await this.db.nodes.toArray()).filter((n) => !n.deletedAt);
  }

  /** Merges exported nodes into the map, as one undoable write; a node with the same id is replaced. */
  async importNodes(nodes: MapNode[]): Promise<string> {
    for (const n of nodes) this.clock.receive(n.updatedAt);
    return this.group('import', async (w) => {
      for (const n of nodes) await w.put(n);
    });
  }

  /** A new subject with the items in its "待归位" group, as one undoable write. */
  async importItems(subjectTitle: string, items: ItemInput[]): Promise<Written> {
    return this.write('importItems', async (w) => {
      const subject = await this.createSubject(w, subjectTitle, 'user');
      const group = await this.unplacedGroup(w, subject.id);
      const keys = generateNKeysBetween(null, null, items.length);
      for (const [i, input] of items.entries()) await w.create(this.newItem(group, input, keys[i]!));
      return subject;
    });
  }

  // ------------------------------------------------------------ internals

  private async createSubject(w: Writer, title: string, origin: Origin): Promise<MapNode> {
    const subjects = await this.listSubjects();
    const id = this.ulid(this.now());
    const order = generateKeyBetween(subjects.at(-1)?.order ?? null, null);
    return w.put({ id, subjectId: id, kind: 'subject', order, title: title.trim(), origin, createdAt: this.now(), updatedAt: '' });
  }

  private newItem(parent: MapNode, input: ItemInput, order: string): NewNode {
    return {
      subjectId: parent.subjectId,
      kind: 'item',
      parentId: parent.id,
      order,
      title: input.title.trim(),
      itemType: input.itemType,
      ...(input.latex === undefined ? {} : { latex: input.latex }),
      ...(input.source ? { source: input.source } : {}),
      origin: input.origin ?? 'user',
    };
  }

  private async write(action: string, fn: (w: Writer) => Promise<MapNode>): Promise<Written> {
    let node!: MapNode;
    const group = await this.group(action, async (w) => {
      node = await fn(w);
    });
    return { group, node };
  }

  /** One map write; `join` appends to an earlier write's group, so one undo reverts both. */
  private async group(action: string, fn: (w: Writer) => Promise<void>, undoes?: string, join?: string): Promise<string> {
    const { nodes, oplog } = this.db;
    return this.db.transaction('rw', nodes, oplog, async () => {
      const group = join ?? this.ulid(this.now());
      const log = async (entityId: string, before: MapNode | null, after: MapNode | null, id: string) =>
        oplog.add({ id, group, action, entityId, before, after, ...(undoes ? { undoes } : {}) });
      const w: Writer = {
        group,
        put: async (node) => {
          const before = (await nodes.get(node.id)) ?? null;
          const after = { ...node, updatedAt: this.clock.tick() };
          await nodes.put(after);
          await log(node.id, before, after, after.updatedAt);
          return after;
        },
        create: (node) => w.put({ ...node, id: this.ulid(this.now()), createdAt: this.now(), updatedAt: '' }),
        drop: async (id) => {
          const before = (await nodes.get(id)) ?? null;
          await nodes.delete(id);
          await log(id, before, null, this.clock.tick());
        },
        mark: async () => {
          await log('', null, null, this.clock.tick());
        },
      };
      await fn(w);
      return group;
    });
  }

  private async isUndone(group: string): Promise<boolean> {
    return (await this.db.oplog.where('undoes').equals(group).count()) > 0;
  }

  private async latestUndoable(): Promise<string | null> {
    const undone = new Set<string>();
    let found: string | null = null;
    await this.db.oplog
      .orderBy('id')
      .reverse()
      .until(() => found !== null)
      .each((e) => {
        if (e.undoes) undone.add(e.undoes);
        else if (!undone.has(e.group)) found = e.group;
      });
    return found;
  }

  private async live(id: string): Promise<MapNode> {
    const n = await this.node(id);
    if (n.deletedAt) throw new Error(`Node ${id} is deleted`);
    return n;
  }

  private async structure(id: string): Promise<MapNode> {
    const n = await this.live(id);
    if (n.kind === 'item') throw new Error('Items have no children');
    return n;
  }

  /** Live children in map order. */
  private async children(parentId: string): Promise<MapNode[]> {
    return (await this.db.nodes.where('parentId').equals(parentId).toArray()).filter((n) => !n.deletedAt).sort(byOrder);
  }

  /** A fractional index before `beforeId`, or last; `moving` is left out of the siblings. */
  private async orderAt(parentId: string, beforeId?: string, moving?: string): Promise<string> {
    const siblings = (await this.children(parentId)).filter((s) => s.id !== moving);
    const i = beforeId === undefined ? siblings.length : siblings.findIndex((s) => s.id === beforeId);
    if (i < 0) throw new Error(`${beforeId} is not a child of ${parentId}`);
    return generateKeyBetween(siblings[i - 1]?.order ?? null, siblings[i]?.order ?? null);
  }

  /** 1 for a subject. */
  private async depthOf(node: MapNode): Promise<number> {
    return (await this.pathOf(node.id)).length;
  }

  /** Levels of sections in a subtree: 0 for an item, 1 for a section without sections below. */
  private async sectionHeight(node: MapNode): Promise<number> {
    if (node.kind === 'item') return 0;
    const heights = await Promise.all((await this.children(node.id)).map((c) => this.sectionHeight(c)));
    return 1 + Math.max(0, ...heights);
  }

  private async placeUnder(w: Writer, node: MapNode, parent: MapNode, order: string): Promise<void> {
    const path = await this.pathOf(parent.id);
    if (path.some((p) => p.id === node.id)) throw new Error('A node cannot move into itself');
    if (path.length + (await this.sectionHeight(node)) > MAX_DEPTH) throw new UserError('error.mapTooDeep');
    await w.put({ ...node, parentId: parent.id, order, subjectId: parent.subjectId });
    if (node.subjectId !== parent.subjectId) await this.setSubject(w, node.id, parent.subjectId);
  }

  /** Every node below `id`, deleted ones too, follows it into another subject. */
  private async setSubject(w: Writer, id: string, subjectId: string): Promise<void> {
    for (const child of await this.db.nodes.where('parentId').equals(id).toArray()) {
      await w.put({ ...child, subjectId });
      await this.setSubject(w, child.id, subjectId);
    }
  }

  private async unplacedGroup(w: Writer, subjectId: string): Promise<MapNode> {
    const existing = (await this.children(subjectId)).find((n) => n.role === 'unplaced');
    if (existing) return existing;
    const subject = await this.structure(subjectId);
    if (subject.kind !== 'subject') throw new Error(`${subjectId} is not a subject`);
    return w.create({ subjectId, kind: 'section', parentId: subjectId, order: await this.orderAt(subjectId), title: '', origin: 'user', role: 'unplaced' });
  }

  /** "清空所有数据": every table, the map, its history and the local recordings. */
  async clearAll(): Promise<void> {
    await Promise.all(this.db.tables.map((t) => t.clear()));
  }

  // ------------------------------------------------------------ recorded questions (local only, not logged)

  async recordAsk(input: Omit<Ask, 'id' | 'sentAt'>): Promise<Ask> {
    const at = this.now();
    const ask: Ask = { ...input, conversationUrl: stripHash(input.conversationUrl), id: this.ulid(at), sentAt: at };
    await this.db.asks.add(ask);
    return ask;
  }

  /** Recorded questions, newest first. */
  async listAsks(): Promise<Ask[]> {
    return this.db.asks.orderBy('sentAt').reverse().toArray();
  }

  /** Deleting a question also deletes what was inferred from it. */
  private async deleteAsks(ids: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.asks, this.db.askTags, async () => {
      await this.db.askTags.where('askId').anyOf(ids).delete();
      await this.db.asks.bulkDelete(ids);
    });
  }

  async deleteAsk(id: string): Promise<void> {
    await this.deleteAsks([id]);
  }

  async clearAsks(): Promise<void> {
    await this.deleteAsks(await this.db.asks.toCollection().primaryKeys());
  }

  async deleteConversationAsks(conversationUrl: string): Promise<void> {
    await this.deleteAsks(await this.db.asks.where('conversationUrl').equals(stripHash(conversationUrl)).primaryKeys());
  }

  async setAskVectors(rows: { id: string; vector: number[]; vectorModel: string }[]): Promise<void> {
    await this.db.transaction('rw', this.db.asks, async () => {
      for (const { id, vector, vectorModel } of rows) await this.db.asks.update(id, { vector, vectorModel });
    });
  }
}
