import { UserError } from '@/src/errors';
import { generateKeyBetween } from 'fractional-indexing';
import { monotonicFactory } from 'ulid';
import type { CapturedSelection } from '@/src/capture/selection';
import { Hlc } from './hlc';
import type { Chat2KnowDB } from './schema';
import type { Ask, AskTag, Concept, Diagnosis, Edge, EdgeKind, Embedding, Entity, InboxItem, KNode, Mastery, NodeView, OpLogEntry, Preference, PrereqEdge, QuizItem, Review, ReviewMode, Source, Verdict } from './types';
import { DAY_MS, isDue, nextInterval, quizMode } from '@/src/review/schedule';
import type { TextQuote } from '@/src/capture/text-quote';
import { titleFromMarkdown } from './title';
import { conceptKey } from '@/src/graph/prereq';

export const EXPORT_FORMAT = 'chat2know';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  nodes: KNode[];
  edges: Edge[];
  sources: Source[];
  reviews: Review[];
  preferences: Preference[];
}

export interface ImportResult {
  nodes: number;
  edges: number;
  sources: number;
  reviews: number;
  preferences: number;
}

export type CaptureType = Extract<KNode['type'], 'knowledge' | 'idea'>;

export interface AskLaterInput {
  term: string;
  question: string;
  capture: CapturedSelection;
}

export interface AskLaterResult {
  nodeId: string;
  askCount: number;
  merged: boolean;
}

/** What the content script needs to underline open questions on a page. */
export interface PageQuestion {
  nodeId: string;
  term: string;
  quote: TextQuote;
}

const stripHash = (url: string) => url.replace(/#.*$/, '');

/** Kept knowledge the user must know by heart. Open questions marked "know by heart" wait until they are kept. */
const isQuizzable = (n: KNode) => n.type === 'knowledge' && n.status !== 'draft' && n.mastery === 'internalize';

export interface AskView extends Omit<Ask, 'vector' | 'vectorModel'> {
  concepts: string[];
}

export interface Stats {
  masteredThisWeek: number;
  /** The north star for the week before this one, then the one before that, and so on (3 weeks). */
  earlierWeeks: number[];
  due: number;
  mustKnow: number;
  openQuestions: number;
}

export const INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The user's final decision when keeping an answered question. */
export interface KeepDecision {
  title: string;
  summary: string;
  /** For instances: the concept the kept node is an example of. */
  concept?: string;
}

/**
 * The only write path to the database. Every write also appends to the oplog
 * in the same transaction, so a future sync layer can replay changes.
 */
export class Repository {
  private readonly ulid = monotonicFactory();

  constructor(
    private readonly db: Chat2KnowDB,
    private readonly clock: Hlc,
    private readonly now: () => number = Date.now,
  ) {}

  private log(entity: Entity, entityId: string, op: OpLogEntry['op'], patch: object): OpLogEntry {
    return { id: this.clock.tick(), entity, entityId, op, patch: { ...patch } };
  }

  async capture(type: CaptureType, input: CapturedSelection): Promise<NodeView> {
    const at = this.now();
    const node: KNode = {
      id: this.ulid(at),
      type,
      title: titleFromMarkdown(input.markdown) || titleFromMarkdown(input.quote.exact),
      body: input.markdown,
      // Knowledge waits for the user to pick a question title; ideas are kept as-is.
      status: type === 'knowledge' ? 'draft' : 'confirmed',
      askCount: 0,
      createdAt: at,
      updatedAt: this.clock.tick(),
    };
    const source = this.newSource(node.id, input, at);
    await this.db.transaction('rw', this.db.nodes, this.db.sources, this.db.oplog, async () => {
      await this.db.nodes.add(node);
      await this.db.sources.add(source);
      await this.db.oplog.bulkAdd([this.log('nodes', node.id, 'put', node), this.log('sources', source.id, 'put', source)]);
    });
    return { ...node, sources: [source] };
  }

  private newSource(nodeId: string, input: CapturedSelection, at: number): Source {
    return {
      id: this.ulid(at),
      nodeId,
      url: input.url,
      pageTitle: input.pageTitle,
      quoteExact: input.quote.exact,
      quotePrefix: input.quote.prefix,
      quoteSuffix: input.quote.suffix,
      capturedAt: at,
    };
  }

  /**
   * Saves an "ask later" question. Asking about the same term again while it is
   * still open merges into the existing question: one more source sentence and
   * a higher askCount, which signals the term matters.
   */
  async askLater(input: AskLaterInput, { merge = true } = {}): Promise<AskLaterResult> {
    const at = this.now();
    const question = input.question.trim();
    return this.db.transaction('rw', this.db.nodes, this.db.sources, this.db.oplog, async () => {
      const existing = !merge
        ? undefined
        : (await this.db.nodes.where('term').equalsIgnoreCase(input.term.trim()).toArray()).find(
            (n) => n.type === 'question' && n.status === 'open' && n.deletedAt === undefined,
          );
      if (existing) {
        const source = this.newSource(existing.id, input.capture, at);
        const patch: Partial<KNode> = { askCount: existing.askCount + 1, updatedAt: this.clock.tick() };
        if (question && !existing.originalAsk) Object.assign(patch, { title: question, originalAsk: question });
        await this.db.nodes.update(existing.id, patch);
        await this.db.sources.add(source);
        await this.db.oplog.bulkAdd([this.log('nodes', existing.id, 'put', patch), this.log('sources', source.id, 'put', source)]);
        return { nodeId: existing.id, askCount: patch.askCount!, merged: true };
      }
      const node: KNode = {
        id: this.ulid(at),
        type: 'question',
        title: question,
        ...(question ? { originalAsk: question } : {}),
        term: input.term.trim(),
        body: input.capture.markdown,
        status: 'open',
        askCount: 1,
        createdAt: at,
        updatedAt: this.clock.tick(),
      };
      const source = this.newSource(node.id, input.capture, at);
      await this.db.nodes.add(node);
      await this.db.sources.add(source);
      await this.db.oplog.bulkAdd([this.log('nodes', node.id, 'put', node), this.log('sources', source.id, 'put', source)]);
      return { nodeId: node.id, askCount: 1, merged: false };
    });
  }

  /** Applies a patch to a node and logs it. Must run inside a transaction covering nodes and oplog. */
  private async patchNode(id: string, patch: Partial<KNode>): Promise<KNode> {
    const node = await this.db.nodes.get(id);
    if (!node) throw new Error(`Node ${id} not found`);
    const full = { ...patch, updatedAt: this.clock.tick() };
    await this.db.nodes.update(id, full);
    await this.db.oplog.add(this.log('nodes', id, 'put', full));
    return { ...node, ...full };
  }

  private async addEdge(from: string, to: string, kind: EdgeKind, order: string): Promise<Edge> {
    const edge: Edge = { id: this.ulid(this.now()), from, to, kind, order };
    await this.db.edges.add(edge);
    await this.db.oplog.add(this.log('edges', edge.id, 'put', edge));
    return edge;
  }

  async getNode(id: string): Promise<KNode | undefined> {
    return this.db.nodes.get(id);
  }

  async parentOf(nodeId: string): Promise<KNode | undefined> {
    const edge = await this.db.edges.where('to').equals(nodeId).first();
    return edge && this.db.nodes.get(edge.from);
  }

  /** A question asked about a card or an answer: a child node that arose from it. */
  async askFollowUp(parentId: string, question: string): Promise<KNode> {
    const q = question.trim();
    if (!q) throw new UserError('error.questionEmpty');
    return this.db.transaction('rw', [this.db.nodes, this.db.edges, this.db.oplog], async () => {
      if (!(await this.db.nodes.get(parentId))) throw new Error(`Node ${parentId} not found`);
      const at = this.now();
      const node: KNode = { id: this.ulid(at), type: 'question', title: q, originalAsk: q, status: 'open', askCount: 1, createdAt: at, updatedAt: this.clock.tick() };
      await this.db.nodes.add(node);
      await this.db.oplog.add(this.log('nodes', node.id, 'put', node));
      await this.replaceParent(node.id, parentId, 'arose_from');
      return node;
    });
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

  /** Recorded questions, newest first, with the names of the concepts they were tagged with. Vectors stay in the background. */
  async listAskViews(): Promise<AskView[]> {
    const names = new Map((await this.db.concepts.toArray()).map((c) => [c.id, c.name]));
    const byAsk = new Map<string, string[]>();
    for (const t of await this.db.askTags.toArray()) byAsk.set(t.askId, [...(byAsk.get(t.askId) ?? []), names.get(t.conceptId)!]);
    return (await this.listAsks()).map(({ vector: _v, vectorModel: _m, ...a }) => ({ ...a, concepts: byAsk.get(a.id) ?? [] }));
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

  /** Questions concept tagging has not looked at yet, oldest first. */
  async untaggedAsks(): Promise<Ask[]> {
    return (await this.db.asks.orderBy('sentAt').toArray()).filter((a) => a.taggedAt === undefined);
  }

  async setAskVectors(rows: { id: string; vector: number[]; vectorModel: string }[]): Promise<void> {
    await this.db.transaction('rw', this.db.asks, async () => {
      for (const { id, vector, vectorModel } of rows) await this.db.asks.update(id, { vector, vectorModel });
    });
  }

  async listAskTags(): Promise<AskTag[]> {
    return this.db.askTags.toArray();
  }

  /** Records which concepts each question is about, and that it was looked at. */
  async saveTags(tags: { askId: string; conceptIds: string[] }[]): Promise<void> {
    const at = this.now();
    await this.db.transaction('rw', this.db.asks, this.db.askTags, async () => {
      for (const { askId, conceptIds } of tags) {
        await this.db.askTags.bulkAdd([...new Set(conceptIds)].map((conceptId) => ({ id: this.ulid(at), askId, conceptId })));
        await this.db.asks.update(askId, { taggedAt: at });
      }
    });
  }

  // ------------------------------------------------------------ diagnoses (local only, not logged)

  async listDiagnoses(): Promise<Diagnosis[]> {
    return this.db.diagnoses.orderBy('createdAt').reverse().toArray();
  }

  async addDiagnoses(list: Omit<Diagnosis, 'id' | 'createdAt' | 'status'>[]): Promise<Diagnosis[]> {
    const at = this.now();
    const rows: Diagnosis[] = list.map((d) => ({ ...d, id: this.ulid(at), status: 'suspected', createdAt: at }));
    await this.db.diagnoses.bulkAdd(rows);
    return rows;
  }

  // ------------------------------------------------------------ prerequisite graph (local only, not logged)

  async listConcepts(): Promise<Concept[]> {
    return this.db.concepts.toArray();
  }

  async linkConcepts(links: { conceptId: string; nodeId: string }[]): Promise<void> {
    await this.db.transaction('rw', this.db.concepts, async () => {
      for (const { conceptId, nodeId } of links) await this.db.concepts.update(conceptId, { nodeId });
    });
  }

  async listPrereqEdges(): Promise<PrereqEdge[]> {
    return this.db.prereqEdges.toArray();
  }

  /**
   * Adds concepts and prerequisite edges, by name, to a domain's graph. Names
   * already in the domain are reused; edges already there are skipped.
   */
  async addToGraph(domain: string, names: string[], edges: { from: string; to: string }[]): Promise<void> {
    await this.db.transaction('rw', this.db.concepts, this.db.prereqEdges, async () => {
      const at = this.now();
      const inDomain = (await this.db.concepts.toArray()).filter((c) => conceptKey(c.domain) === conceptKey(domain));
      const byKey = new Map(inDomain.map((c) => [conceptKey(c.name), c]));
      const domainName = inDomain[0]?.domain ?? domain.trim();
      for (const name of [...names, ...edges.flatMap((e) => [e.from, e.to])]) {
        if (byKey.has(conceptKey(name))) continue;
        const concept: Concept = { id: this.ulid(at), domain: domainName, name: name.trim(), createdAt: at };
        await this.db.concepts.add(concept);
        byKey.set(conceptKey(name), concept);
      }
      const existing = new Set((await this.db.prereqEdges.toArray()).map((e) => `${e.from}>${e.to}`));
      for (const e of edges) {
        const from = byKey.get(conceptKey(e.from))!.id;
        const to = byKey.get(conceptKey(e.to))!.id;
        if (existing.has(`${from}>${to}`)) continue;
        existing.add(`${from}>${to}`);
        await this.db.prereqEdges.add({ id: this.ulid(at), from, to });
      }
    });
  }

  // ------------------------------------------------------------ embeddings (cache, not logged)

  async embeddingsFor(ids: string[]): Promise<Map<string, Embedding>> {
    return new Map((await this.db.embeddings.bulkGet(ids)).filter((e): e is Embedding => !!e).map((e) => [e.nodeId, e]));
  }

  async putEmbeddings(rows: Embedding[]): Promise<void> {
    await this.db.embeddings.bulkPut(rows);
  }

  /** A card and every live card below it, parents before children, siblings in tree order. */
  async subtree(rootId: string): Promise<KNode[]> {
    const root = await this.db.nodes.get(rootId);
    if (!root || root.deletedAt !== undefined) throw new Error('Card not found');
    const out = [root];
    for (let frontier = [rootId]; frontier.length; ) {
      const edges = (await this.db.edges.where('from').anyOf(frontier).toArray()).sort((a, b) => (a.order < b.order ? -1 : 1));
      const children = (await this.db.nodes.bulkGet(edges.map((e) => e.to))).filter((n): n is KNode => !!n && n.deletedAt === undefined);
      out.push(...children);
      frontier = children.map((n) => n.id);
    }
    return out;
  }

  /** Ids of every node below `id` in the tree. */
  async descendantsOf(id: string): Promise<Set<string>> {
    const out = new Set<string>();
    for (let frontier = [id]; frontier.length; ) {
      const children = (await this.db.edges.where('from').anyOf(frontier).toArray()).map((e) => e.to).filter((c) => !out.has(c));
      children.forEach((c) => out.add(c));
      frontier = children;
    }
    return out;
  }

  /**
   * Merges a duplicate concept into an existing node: its sources and children
   * move over, ask counts add up, and the duplicate is soft-deleted.
   */
  async mergeInto(duplicateId: string, targetId: string): Promise<void> {
    if (duplicateId === targetId) throw new Error('Cannot merge a card into itself');
    await this.db.transaction('rw', [this.db.nodes, this.db.edges, this.db.sources, this.db.oplog], async () => {
      const dup = await this.db.nodes.get(duplicateId);
      const target = await this.db.nodes.get(targetId);
      if (!dup || !target) throw new Error('Card not found');
      for (const s of await this.db.sources.where('nodeId').equals(duplicateId).toArray()) {
        await this.db.sources.update(s.id, { nodeId: targetId });
        await this.db.oplog.add(this.log('sources', s.id, 'put', { nodeId: targetId }));
      }
      for (const e of await this.db.edges.where('from').equals(duplicateId).toArray()) {
        if (e.to === targetId) continue;
        await this.replaceParent(e.to, targetId, e.kind);
      }
      await this.removeParent(duplicateId);
      await this.patchNode(targetId, { askCount: target.askCount + dup.askCount });
      await this.patchNode(duplicateId, { deletedAt: this.now() });
    });
  }

  /** Adds cards the user kept from an organize pass, each with its quote as provenance. */
  async addCards(cards: { title: string; summary: string; quote: string }[], page?: { url: string; pageTitle: string }): Promise<string[]> {
    const ids: string[] = [];
    await this.db.transaction('rw', this.db.nodes, this.db.sources, this.db.oplog, async () => {
      for (const c of cards) {
        const at = this.now();
        const node: KNode = {
          id: this.ulid(at),
          type: 'knowledge',
          title: c.title.trim(),
          summary: c.summary.trim(),
          body: c.quote,
          status: 'confirmed',
          askCount: 0,
          createdAt: at,
          updatedAt: this.clock.tick(),
        };
        if (!node.title || !node.summary) throw new UserError('error.titleSummaryRequired');
        await this.db.nodes.add(node);
        await this.db.oplog.add(this.log('nodes', node.id, 'put', node));
        if (page) {
          const source = this.newSource(node.id, { ...page, markdown: c.quote, quote: { exact: c.quote, prefix: '', suffix: '' } }, at);
          await this.db.sources.add(source);
          await this.db.oplog.add(this.log('sources', source.id, 'put', source));
        }
        ids.push(node.id);
      }
    });
    return ids;
  }

  async sourcesOf(nodeId: string): Promise<Source[]> {
    return this.db.sources.where('nodeId').equals(nodeId).toArray();
  }

  // ------------------------------------------------------------ distillation

  /** Knowledge cards still waiting for a summary (and not failed). Derived from data, so it survives worker restarts. */
  async pendingDistills(): Promise<KNode[]> {
    return (await this.db.nodes.where('status').equals('draft').toArray()).filter(
      (n) => n.type === 'knowledge' && n.deletedAt === undefined && !n.summary && !n.distillError,
    );
  }

  async setDistillation(id: string, summary: string, titleCandidates: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.oplog, () =>
      this.patchNode(id, { summary, titleCandidates, distillError: undefined }),
    );
  }

  async setDistillError(id: string, message: string | undefined): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.oplog, () => this.patchNode(id, { distillError: message }));
  }

  /** The user picked or wrote the question title for a draft card. */
  async confirmTitle(id: string, title: string): Promise<void> {
    const t = title.trim();
    if (!t) throw new UserError('error.titleEmpty');
    await this.db.transaction('rw', this.db.nodes, this.db.oplog, () =>
      this.patchNode(id, { title: t, status: 'confirmed', titleCandidates: undefined }),
    );
  }

  // ------------------------------------------------------------ inbox (not logged: disposable)

  async addInboxItem(item: Omit<InboxItem, 'id' | 'createdAt' | 'expiresAt'>): Promise<InboxItem> {
    const at = this.now();
    const full: InboxItem = { ...item, id: this.ulid(at), createdAt: at, expiresAt: at + INBOX_TTL_MS };
    await this.db.inbox.add(full);
    return full;
  }

  /** Live inbox items, newest first. Expired items are purged first. */
  async listInbox(): Promise<InboxItem[]> {
    await this.db.inbox.where('expiresAt').belowOrEqual(this.now()).delete();
    return this.db.inbox.orderBy('createdAt').reverse().toArray();
  }

  async getInboxItem(id: string): Promise<InboxItem> {
    const item = await this.db.inbox.get(id);
    if (!item) throw new UserError('error.answerExpired');
    return item;
  }

  /**
   * Turns an answered question into kept knowledge. The question node itself is
   * promoted (restored if the user had dismissed it), so its sources and ask
   * history stay. Instances additionally hang under their concept node.
   */
  async keep(inboxId: string, decision: KeepDecision): Promise<KNode> {
    const title = decision.title.trim();
    const summary = decision.summary.trim();
    if (!title || !summary) throw new UserError('error.titleSummaryRequired');
    return this.db.transaction('rw', [this.db.nodes, this.db.edges, this.db.inbox, this.db.oplog], async () => {
      const item = await this.getInboxItem(inboxId);
      const patch: Partial<KNode> = { type: 'knowledge', title, summary, status: 'confirmed', deletedAt: undefined };
      if (decision.concept) patch.mastery = 'index'; // an example only needs to be findable
      const node = await this.patchNode(item.questionNodeId, patch);
      if (decision.concept) {
        const concept = await this.findOrCreateTopic(decision.concept);
        await this.replaceParent(node.id, concept.id, 'instance_of');
      }
      // Every answer to this question is now accounted for, so none resurfaces as a leftover.
      await this.db.inbox.where('questionNodeId').equals(item.questionNodeId).modify({ promotedNodeId: node.id });
      return node;
    });
  }

  private async findOrCreateTopic(title: string): Promise<KNode> {
    const wanted = title.trim().toLowerCase();
    const existing = (await this.db.nodes.toArray()).find(
      (n) => n.deletedAt === undefined && (n.type === 'topic' || n.type === 'knowledge') && n.title.trim().toLowerCase() === wanted,
    );
    if (existing) return existing;
    const at = this.now();
    const node: KNode = { id: this.ulid(at), type: 'topic', title: title.trim(), status: 'confirmed', askCount: 0, createdAt: at, updatedAt: this.clock.tick() };
    await this.db.nodes.add(node);
    await this.db.oplog.add(this.log('nodes', node.id, 'put', node));
    return node;
  }

  private async removeParent(childId: string): Promise<Edge | undefined> {
    const [old] = await this.db.edges.where('to').equals(childId).toArray();
    if (!old) return undefined;
    await this.db.edges.delete(old.id);
    await this.db.oplog.add(this.log('edges', old.id, 'delete', {}));
    return old;
  }

  /**
   * Makes `parentId` the only tree parent of `childId`, placed before sibling
   * `beforeId` or after the last sibling. Only the moved edge gets a new order key.
   */
  private async replaceParent(childId: string, parentId: string, kind: EdgeKind, beforeId?: string): Promise<Edge> {
    await this.removeParent(childId);
    const siblings = (await this.db.edges.where('from').equals(parentId).toArray()).sort((a, b) => (a.order < b.order ? -1 : 1));
    const at = beforeId === undefined ? siblings.length : siblings.findIndex((e) => e.to === beforeId);
    if (at < 0) throw new Error('Sibling not found under the target parent');
    return this.addEdge(parentId, childId, kind, generateKeyBetween(siblings[at - 1]?.order ?? null, siblings[at]?.order ?? null));
  }

  /**
   * Moves a card in the tree: under `parentId` (before `beforeId` if given), or
   * to the top level when `parentId` is null. A move keeps the relation kind
   * when the parent stays the same; otherwise it becomes a plain child.
   */
  async moveNode(childId: string, parentId: string | null, beforeId?: string): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.edges, this.db.oplog, async () => {
      if (parentId === null) {
        await this.removeParent(childId);
        return;
      }
      for (let up: string | undefined = parentId; up; up = (await this.db.edges.where('to').equals(up).first())?.from) {
        if (up === childId) throw new UserError('error.cardUnderItself');
      }
      const old = await this.db.edges.where('to').equals(childId).first();
      await this.replaceParent(childId, parentId, old?.from === parentId ? old.kind : 'child', beforeId);
    });
  }

  async addPreference(pref: Omit<Preference, 'id' | 'createdAt'>): Promise<void> {
    const at = this.now();
    const full: Preference = { ...pref, id: this.ulid(at), createdAt: at };
    await this.db.transaction('rw', this.db.preferences, this.db.oplog, async () => {
      await this.db.preferences.add(full);
      await this.db.oplog.add(this.log('preferences', full.id, 'put', full));
    });
  }

  async recentPreferences(limit: number): Promise<Preference[]> {
    return this.db.preferences.orderBy('createdAt').reverse().limit(limit).toArray();
  }

  /** Sets or edits the question text of an ask-later node. */
  async updateQuestion(id: string, question: string): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.oplog, async () => {
      const node = await this.db.nodes.get(id);
      if (!node || node.deletedAt !== undefined) throw new Error('Question not found');
      const title = question.trim();
      const patch: Partial<KNode> = { title, updatedAt: this.clock.tick() };
      if (title && !node.originalAsk) patch.originalAsk = title;
      await this.db.nodes.update(id, patch);
      await this.db.oplog.add(this.log('nodes', id, 'put', patch));
    });
  }

  /** Open questions with a source on this page, for underlining their terms. */
  async questionsForUrl(url: string): Promise<PageQuestion[]> {
    const page = stripHash(url);
    const open = (await this.db.nodes.where('status').equals('open').toArray()).filter(
      (n) => n.type === 'question' && n.deletedAt === undefined && n.term,
    );
    const ids = new Set(open.map((n) => n.id));
    const sources = (await this.db.sources.where('nodeId').anyOf([...ids]).toArray()).filter((s) => stripHash(s.url) === page);
    const byId = new Map(open.map((n) => [n.id, n]));
    return sources.map((s) => ({
      nodeId: s.nodeId,
      term: byId.get(s.nodeId)!.term!,
      quote: { exact: s.quoteExact, prefix: s.quotePrefix, suffix: s.quoteSuffix },
    }));
  }

  /** Live nodes, newest first, each with its sources. */
  /** Live nodes, newest first, each with its sources and tree parent. */
  async listNodes(): Promise<NodeView[]> {
    const nodes = (await this.db.nodes.orderBy('createdAt').reverse().toArray()).filter((n) => n.deletedAt === undefined);
    const ids = nodes.map((n) => n.id);
    const sources = await this.db.sources.where('nodeId').anyOf(ids).toArray();
    const byNode = new Map<string, Source[]>();
    for (const s of sources) byNode.set(s.nodeId, [...(byNode.get(s.nodeId) ?? []), s]);
    const parents = new Map((await this.db.edges.where('to').anyOf(ids).toArray()).map((e) => [e.to, e]));
    const latest = await this.latestReviews();
    return nodes.map((n) => {
      const e = parents.get(n.id);
      const verdict = latest.get(n.id)?.verdict;
      return {
        ...n,
        sources: byNode.get(n.id) ?? [],
        ...(e ? { parent: { id: e.from, kind: e.kind, order: e.order } } : {}),
        ...(verdict ? { lastVerdict: verdict } : {}),
      };
    });
  }

  // ------------------------------------------------------------ mastery and review

  async setMastery(id: string, mastery: Mastery | undefined): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.oplog, () => this.patchNode(id, { mastery }));
  }

  private async latestReviews(): Promise<Map<string, Review>> {
    const latest = new Map<string, Review>();
    for (const r of await this.db.reviews.orderBy('createdAt').toArray()) latest.set(r.nodeId, r);
    return latest;
  }

  /** Cards the user must know by heart whose review is due, oldest due first, each with how it is checked this time. */
  async dueForQuiz(modelConfigured: boolean): Promise<QuizItem[]> {
    const now = this.now();
    const latest = await this.latestReviews();
    const quizzed = new Map<string, number>();
    for (const r of await this.db.reviews.toArray()) if (r.mode !== 'explain') quizzed.set(r.nodeId, (quizzed.get(r.nodeId) ?? 0) + 1);
    return (await this.listNodes())
      .filter((n) => isQuizzable(n) && isDue(latest.get(n.id), now))
      .sort((a, b) => (latest.get(a.id)?.dueAt ?? 0) - (latest.get(b.id)?.dueAt ?? 0))
      .map((n) => ({ ...n, mode: quizMode(quizzed.get(n.id) ?? 0, modelConfigured) }));
  }

  /** Records a review, schedules the next one and moves the card in or out of `mastered`. */
  async recordReview(input: { nodeId: string; mode: ReviewMode; prompt: string; answer: string; verdict: Verdict; feedback?: string }): Promise<Review> {
    return this.db.transaction('rw', [this.db.nodes, this.db.reviews, this.db.oplog], async () => {
      const previous = (await this.db.reviews.where('nodeId').equals(input.nodeId).sortBy('createdAt')).at(-1);
      const at = this.now();
      const interval = nextInterval(previous?.interval, input.verdict);
      const review: Review = { ...input, id: this.ulid(at), interval, dueAt: at + interval * DAY_MS, createdAt: at };
      await this.db.reviews.add(review);
      await this.db.oplog.add(this.log('reviews', review.id, 'put', review));
      if (input.verdict !== 'partial') await this.patchNode(input.nodeId, { status: input.verdict === 'pass' ? 'mastered' : 'confirmed' });
      return review;
    });
  }

  /**
   * North star (cards to know by heart that passed a check in the last 7 days),
   * the same count for the three weeks before, and queue sizes.
   */
  async stats(): Promise<Stats> {
    const now = this.now();
    const nodes = await this.listNodes();
    const mustKnow = new Set(nodes.filter(isQuizzable).map((n) => n.id));
    const weeks = [0, 1, 2, 3].map(() => new Set<string>());
    for (const r of await this.db.reviews.where('createdAt').aboveOrEqual(now - 28 * DAY_MS).toArray()) {
      if (r.verdict === 'pass' && mustKnow.has(r.nodeId)) weeks[Math.min(3, Math.floor((now - r.createdAt) / (7 * DAY_MS)))]!.add(r.nodeId);
    }
    return {
      masteredThisWeek: weeks[0]!.size,
      earlierWeeks: weeks.slice(1).map((w) => w.size),
      due: (await this.dueForQuiz(false)).length,
      mustKnow: mustKnow.size,
      openQuestions: nodes.filter((n) => n.type === 'question' && n.status === 'open').length,
    };
  }

  async getSource(id: string): Promise<Source | undefined> {
    return this.db.sources.get(id);
  }

  async deleteNode(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.nodes, this.db.oplog, async () => {
      const node = await this.db.nodes.get(id);
      if (!node || node.deletedAt !== undefined) return;
      const patch = { deletedAt: this.now(), updatedAt: this.clock.tick() };
      await this.db.nodes.update(id, patch);
      await this.db.oplog.add(this.log('nodes', id, 'delete', patch));
    });
  }

  async exportData(): Promise<ExportFile> {
    return this.db.transaction('r', [this.db.nodes, this.db.edges, this.db.sources, this.db.reviews, this.db.preferences], async () => ({
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: this.now(),
      nodes: await this.db.nodes.toArray(),
      edges: await this.db.edges.toArray(),
      sources: await this.db.sources.toArray(),
      reviews: await this.db.reviews.toArray(),
      preferences: await this.db.preferences.toArray(),
    }));
  }

  /** Merges an export into the database. Rows with the same id are replaced. */
  async importData(data: unknown): Promise<ImportResult> {
    const file = parseExport(data);
    for (const n of file.nodes) this.clock.receive(n.updatedAt);
    await this.db.transaction(
      'rw',
      [this.db.nodes, this.db.edges, this.db.sources, this.db.reviews, this.db.preferences, this.db.oplog],
      async () => {
        await this.db.nodes.bulkPut(file.nodes);
        await this.db.edges.bulkPut(file.edges);
        await this.db.sources.bulkPut(file.sources);
        await this.db.reviews.bulkPut(file.reviews);
        await this.db.preferences.bulkPut(file.preferences);
        await this.db.oplog.bulkAdd([
          ...file.nodes.map((r) => this.log('nodes', r.id, 'put', r)),
          ...file.edges.map((r) => this.log('edges', r.id, 'put', r)),
          ...file.sources.map((r) => this.log('sources', r.id, 'put', r)),
          ...file.reviews.map((r) => this.log('reviews', r.id, 'put', r)),
          ...file.preferences.map((r) => this.log('preferences', r.id, 'put', r)),
        ]);
      },
    );
    return {
      nodes: file.nodes.length,
      edges: file.edges.length,
      sources: file.sources.length,
      reviews: file.reviews.length,
      preferences: file.preferences.length,
    };
  }
}

function isRow(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

export function parseExport(data: unknown): ExportFile {
  const file = (typeof data === 'string' ? JSON.parse(data) : data) as Partial<ExportFile> | null;
  if (!file || file.format !== EXPORT_FORMAT) throw new UserError('error.notExport');
  if (file.version !== EXPORT_VERSION) throw new UserError('error.exportVersion', [String(file.version)]);
  for (const key of ['nodes', 'edges', 'sources', 'reviews'] as const) {
    const rows = file[key];
    if (!Array.isArray(rows) || !rows.every(isRow)) throw new UserError('error.invalidExport', [key]);
  }
  // Exports made before schema v2 lack askCount and preferences.
  for (const node of file.nodes as Partial<KNode>[]) node.askCount ??= 0;
  file.preferences ??= [];
  if (!Array.isArray(file.preferences) || !file.preferences.every(isRow)) throw new UserError('error.invalidExport', ['preferences']);
  return file as ExportFile;
}
