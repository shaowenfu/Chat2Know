import { UserError } from '@/src/errors';
import { titleFromMarkdown } from '@/src/db/title';
import type { ItemInput } from '@/src/db/repository';
import type { ItemSource, MapNode } from '@/src/db/types';

export const EXPORT_FORMAT = 'chat2know';
export const EXPORT_VERSION = 2;

/** The lossless export: every live map node, grey outline nodes included. Never asks or settings. */
export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  nodes: MapNode[];
}

export type Imported = { version: 2; nodes: MapNode[] } | { version: 1; items: ItemInput[] };

const KINDS = ['subject', 'section', 'item'];
const ORIGINS = ['user', 'plugin', 'outline'];
const ITEM_TYPES = ['formula', 'statement'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isString = (v: unknown): v is string => typeof v === 'string';

function isSource(v: unknown): v is ItemSource {
  return (
    isObject(v) &&
    ['url', 'pageTitle', 'quoteExact', 'quotePrefix', 'quoteSuffix'].every((k) => isString(v[k])) &&
    typeof v.capturedAt === 'number'
  );
}

function isMapNode(v: unknown): v is MapNode {
  if (!isObject(v)) return false;
  const item = v.kind === 'item';
  return (
    ['id', 'subjectId', 'order', 'title', 'updatedAt'].every((k) => isString(v[k])) &&
    KINDS.includes(v.kind as string) &&
    ORIGINS.includes(v.origin as string) &&
    typeof v.createdAt === 'number' &&
    (v.kind === 'subject' ? v.parentId === undefined && v.subjectId === v.id : isString(v.parentId)) &&
    (item ? ITEM_TYPES.includes(v.itemType as string) : v.itemType === undefined) &&
    (v.latex === undefined || isString(v.latex)) &&
    (v.source === undefined || (item && isSource(v.source))) &&
    (v.role === undefined || (v.role === 'unplaced' && v.kind === 'section')) &&
    (v.editedByUser === undefined || typeof v.editedByUser === 'boolean') &&
    v.deletedAt === undefined
  );
}

/** Every node's parent is a structure node of the same subject in the file. */
function checkTree(nodes: MapNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.parentId === undefined) continue;
    const parent = byId.get(n.parentId);
    if (!parent || parent.kind === 'item' || parent.subjectId !== n.subjectId) throw new UserError('error.invalidExport', [n.id]);
  }
}

/** The display formulas of a v0.1 card body, verbatim. */
const displayFormulas = (body: string) => [...body.matchAll(/\$\$([\s\S]+?)\$\$/g)].map((m) => m[1]!.trim()).filter(Boolean);

/**
 * v0.1 keeps only its knowledge cards: a card with display formulas becomes one
 * formula item per formula, any other card one statement (its summary, else its
 * first line). Question titles are dropped; the first source is kept.
 */
function v01Items(file: Record<string, unknown>): ItemInput[] {
  const nodes = file.nodes;
  const sources = file.sources;
  if (!Array.isArray(nodes) || !nodes.every(isObject)) throw new UserError('error.invalidExport', ['nodes']);
  if (!Array.isArray(sources) || !sources.every(isObject)) throw new UserError('error.invalidExport', ['sources']);
  const items: ItemInput[] = [];
  for (const n of nodes) {
    if (n.type !== 'knowledge' || n.deletedAt !== undefined) continue;
    const s = sources.find((x) => x.nodeId === n.id);
    const source = s && isSource(s) ? { url: s.url, pageTitle: s.pageTitle, quoteExact: s.quoteExact, quotePrefix: s.quotePrefix, quoteSuffix: s.quoteSuffix, capturedAt: s.capturedAt } : undefined;
    const body = isString(n.body) ? n.body : '';
    const formulas = displayFormulas(body);
    if (formulas.length) {
      for (const latex of formulas) items.push({ itemType: 'formula', title: '', latex, ...(source ? { source } : {}) });
      continue;
    }
    const statement = (isString(n.summary) && n.summary.trim()) || titleFromMarkdown(body);
    if (statement) items.push({ itemType: 'statement', title: statement, ...(source ? { source } : {}) });
  }
  return items;
}

/** Reads a v2 export, or a v0.1 export as items to place. */
export function parseImport(text: string): Imported {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new UserError('error.notExport');
  }
  if (!isObject(file) || file.format !== EXPORT_FORMAT) throw new UserError('error.notExport');
  if (file.version === 1) return { version: 1, items: v01Items(file) };
  if (file.version !== EXPORT_VERSION) throw new UserError('error.exportVersion', [String(file.version)]);
  const nodes = file.nodes;
  if (!Array.isArray(nodes)) throw new UserError('error.invalidExport', ['nodes']);
  const bad = nodes.find((n) => !isMapNode(n));
  if (bad !== undefined) throw new UserError('error.invalidExport', [isObject(bad) && isString(bad.id) ? bad.id : 'nodes']);
  checkTree(nodes);
  return { version: 2, nodes };
}
