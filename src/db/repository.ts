import { monotonicFactory } from 'ulid';
import type { CapturedSelection } from '@/src/capture/selection';
import { Hlc } from './hlc';
import type { Chat2KnowDB } from './schema';
import type { Edge, Entity, KNode, NodeView, OpLogEntry, Review, Source } from './types';
import type { TextQuote } from '@/src/capture/text-quote';
import { titleFromMarkdown } from './title';

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
}

export interface ImportResult {
  nodes: number;
  edges: number;
  sources: number;
  reviews: number;
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
      status: 'draft',
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
  async askLater(input: AskLaterInput): Promise<AskLaterResult> {
    const at = this.now();
    const question = input.question.trim();
    return this.db.transaction('rw', this.db.nodes, this.db.sources, this.db.oplog, async () => {
      const existing = (await this.db.nodes.where('term').equalsIgnoreCase(input.term.trim()).toArray()).find(
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
  async listNodes(): Promise<NodeView[]> {
    const nodes = (await this.db.nodes.orderBy('createdAt').reverse().toArray()).filter((n) => n.deletedAt === undefined);
    const sources = await this.db.sources.where('nodeId').anyOf(nodes.map((n) => n.id)).toArray();
    const byNode = new Map<string, Source[]>();
    for (const s of sources) byNode.set(s.nodeId, [...(byNode.get(s.nodeId) ?? []), s]);
    return nodes.map((n) => ({ ...n, sources: byNode.get(n.id) ?? [] }));
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
    return this.db.transaction('r', this.db.nodes, this.db.edges, this.db.sources, this.db.reviews, async () => ({
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: this.now(),
      nodes: await this.db.nodes.toArray(),
      edges: await this.db.edges.toArray(),
      sources: await this.db.sources.toArray(),
      reviews: await this.db.reviews.toArray(),
    }));
  }

  /** Merges an export into the database. Rows with the same id are replaced. */
  async importData(data: unknown): Promise<ImportResult> {
    const file = parseExport(data);
    for (const n of file.nodes) this.clock.receive(n.updatedAt);
    await this.db.transaction(
      'rw',
      [this.db.nodes, this.db.edges, this.db.sources, this.db.reviews, this.db.oplog],
      async () => {
        await this.db.nodes.bulkPut(file.nodes);
        await this.db.edges.bulkPut(file.edges);
        await this.db.sources.bulkPut(file.sources);
        await this.db.reviews.bulkPut(file.reviews);
        await this.db.oplog.bulkAdd([
          ...file.nodes.map((r) => this.log('nodes', r.id, 'put', r)),
          ...file.edges.map((r) => this.log('edges', r.id, 'put', r)),
          ...file.sources.map((r) => this.log('sources', r.id, 'put', r)),
          ...file.reviews.map((r) => this.log('reviews', r.id, 'put', r)),
        ]);
      },
    );
    return {
      nodes: file.nodes.length,
      edges: file.edges.length,
      sources: file.sources.length,
      reviews: file.reviews.length,
    };
  }
}

function isRow(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

export function parseExport(data: unknown): ExportFile {
  const file = (typeof data === 'string' ? JSON.parse(data) : data) as Partial<ExportFile> | null;
  if (!file || file.format !== EXPORT_FORMAT) throw new Error('Not a Chat2Know export file');
  if (file.version !== EXPORT_VERSION) throw new Error(`Unsupported export version: ${String(file.version)}`);
  for (const key of ['nodes', 'edges', 'sources', 'reviews'] as const) {
    const rows = file[key];
    if (!Array.isArray(rows) || !rows.every(isRow)) throw new Error(`Invalid "${key}" in export file`);
  }
  for (const node of file.nodes as Partial<KNode>[]) node.askCount ??= 0; // exports made before schema v2
  return file as ExportFile;
}
