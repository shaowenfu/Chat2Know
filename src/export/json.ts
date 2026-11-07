import { generateKeyBetween } from 'fractional-indexing';
import { UserError } from '@/src/errors';
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

const KINDS = ['subject', 'section', 'item'];
const ORIGINS = ['user', 'plugin', 'outline'];
const ITEM_TYPES = ['formula', 'statement', 'quote'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isString = (v: unknown): v is string => typeof v === 'string';

function isSource(v: unknown): v is ItemSource {
  return (
    isObject(v) &&
    ['url', 'pageTitle', 'quoteExact', 'quotePrefix', 'quoteSuffix'].every((k) => isString(v[k])) &&
    typeof v.capturedAt === 'number'
  );
}

function isOrderKey(key: string): boolean {
  try {
    generateKeyBetween(key, null); // throws on a key that is not a fractional index
    return true;
  } catch {
    return false;
  }
}

function isMapNode(v: unknown): v is MapNode {
  if (!isObject(v)) return false;
  const item = v.kind === 'item';
  return (
    ['id', 'subjectId', 'order', 'title', 'updatedAt'].every((k) => isString(v[k])) &&
    isOrderKey(v.order as string) &&
    KINDS.includes(v.kind as string) &&
    ORIGINS.includes(v.origin as string) &&
    typeof v.createdAt === 'number' &&
    (v.kind === 'subject' ? v.parentId === undefined && v.subjectId === v.id : isString(v.parentId)) &&
    (item ? ITEM_TYPES.includes(v.itemType as string) : v.itemType === undefined) &&
    (v.latex === undefined || isString(v.latex)) &&
    (v.request === undefined || (item && isString(v.request))) &&
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

/** Reads an export of this version. */
export function parseImport(text: string): MapNode[] {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new UserError('error.notExport');
  }
  if (!isObject(file) || file.format !== EXPORT_FORMAT) throw new UserError('error.notExport');
  if (file.version !== EXPORT_VERSION) throw new UserError('error.exportVersion', [String(file.version)]);
  const nodes = file.nodes;
  if (!Array.isArray(nodes)) throw new UserError('error.invalidExport', ['nodes']);
  const bad = nodes.find((n) => !isMapNode(n));
  if (bad !== undefined) throw new UserError('error.invalidExport', [isObject(bad) && isString(bad.id) ? bad.id : 'nodes']);
  checkTree(nodes);
  return nodes;
}
