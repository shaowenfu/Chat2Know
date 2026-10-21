/**
 * Typed message protocol between the content script, background and side panel.
 * Every message has a `type` and a `payload`; each type maps to exactly one response shape.
 */

import type { CapturedSelection } from '@/src/capture/selection';
import type { TextQuote } from '@/src/capture/text-quote';
import type { CaptureType, ImportResult } from '@/src/db/repository';
import type { NodeView } from '@/src/db/types';

export type Context = 'content' | 'background' | 'sidepanel';

export interface MessageMap {
  /** Health check. Any context can ping the background. */
  ping: { req: { from: Context }; res: { from: 'background'; echo: Context; at: number } };

  // Side panel / content script -> background
  /** Inject the selection toolbar into a tab (active tab when omitted). */
  'page/activate': { req: { tabId?: number }; res: { tabId: number } };
  /** Save a selection the content script already captured. */
  'capture/save': { req: { type: CaptureType; capture: CapturedSelection }; res: { nodeId: string } };
  /** Capture the current selection in a tab (shortcut and context-menu path). */
  'capture/fromTab': { req: { type: CaptureType; tabId?: number }; res: { nodeId: string } };
  'nodes/list': { req: Record<string, never>; res: NodeView[] };
  'nodes/delete': { req: { id: string }; res: null };
  /** Open a source page and highlight the quote. */
  'source/open': { req: { sourceId: string }; res: { tabId: number; highlighted: boolean } };
  'data/exportJson': { req: Record<string, never>; res: string };
  'data/exportMarkdown': { req: Record<string, never>; res: string };
  'data/importJson': { req: { json: string }; res: ImportResult };

  // Background -> content script
  'content/capture': { req: Record<string, never>; res: CapturedSelection | null };
  'content/highlight': { req: { quote: TextQuote }; res: { found: boolean } };

  // Background -> side panel (broadcast)
  'event/nodesChanged': { req: Record<string, never>; res: null };
}

export type MessageType = keyof MessageMap;
export type Req<K extends MessageType> = MessageMap[K]['req'];
export type Res<K extends MessageType> = MessageMap[K]['res'];

export interface Envelope<K extends MessageType = MessageType> {
  type: K;
  payload: Req<K>;
}

/** Responses are wrapped so errors cross the context boundary intact. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    'payload' in value
  );
}

export function unwrap<T>(result: Result<T> | undefined): T {
  if (!result) throw new Error('No response from receiver');
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
