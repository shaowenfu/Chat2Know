/**
 * Typed message protocol between the content script, background and side panel.
 * Every message has a `type` and a `payload`; each type maps to exactly one response shape.
 */

import { UserError } from '@/src/errors';
import type { Ask } from '@/src/db/types';
import type { SiteSettings } from '@/src/sites/settings';
import type { TextQuote } from '@/src/capture/text-quote';
import type { ItemType } from '@/src/db/types';
import type { RecordResult } from '@/src/services/record';
import type { PublicSettings } from '@/src/llm/settings';

export type Context = 'content' | 'background' | 'sidepanel';

export interface MessageMap {
  /** Health check. Any context can ping the background. */
  ping: { req: { from: Context }; res: { from: 'background'; echo: Context; at: number } };

  // Model settings
  'settings/get': { req: Record<string, never>; res: PublicSettings };
  /** Omitting apiKey keeps the stored key. */
  'settings/save': { req: { baseUrl: string; model: string; embeddingModel: string; apiKey?: string }; res: PublicSettings };
  'settings/test': { req: Record<string, never>; res: { reply: string } };

  // The AI sites the site script runs on
  'sites/get': { req: Record<string, never>; res: SiteSettings };
  /** Sets the ticked sites. The page requests their host permission first. */
  'sites/setOrigins': { req: { origins: string[] }; res: SiteSettings };
  /** "Also record the questions I send on these sites." */
  'sites/setRecordAsks': { req: { on: boolean }; res: SiteSettings };
  /** From the recorder: a question the user just sent on the sender's page. Stored only if the background's gate allows. */
  'asks/record': { req: { text: string }; res: { recorded: boolean } };
  'asks/list': { req: Record<string, never>; res: Ask[] };
  'asks/delete': { req: { id: string }; res: null };
  'asks/clear': { req: Record<string, never>; res: null };
  /** Stop recording a conversation and delete what was recorded in it. */
  'asks/exclude': { req: { conversationUrl: string }; res: SiteSettings };

  // Recording onto the map
  /** From the site script: a formula or a selection the user just recorded on the sender's page. */
  'map/record': { req: { itemType: ItemType; title: string; latex?: string; quote: TextQuote; pageTitle: string; force?: boolean }; res: RecordResult };
  /** Undoes one write (a toast's "撤销"), or the latest one (Ctrl+Z). */
  'map/undo': { req: { group?: string }; res: { undone: boolean } };
  /** Background -> site script: record the page's selection (Alt+S, context menu). */
  'site/recordSelection': { req: Record<string, never>; res: null };

  // The map's data
  /** The whole map as a file's text; Markdown and OPML leave grey outline nodes out unless asked. */
  'map/export': { req: { format: 'json' | 'markdown' | 'opml'; includeGrey?: boolean }; res: string };
  /** A v2 export merges into the map; a v0.1 export becomes one subject with its knowledge in "待归位". */
  'map/import': { req: { json: string }; res: { nodes: number } };

  // Background -> extension pages (broadcast)
  /** Data or settings changed; open pages reload. */
  'event/dataChanged': { req: Record<string, never>; res: null };
}

export type MessageType = keyof MessageMap;
export type Req<K extends MessageType> = MessageMap[K]['req'];
export type Res<K extends MessageType> = MessageMap[K]['res'];

export interface Envelope<K extends MessageType = MessageType> {
  type: K;
  payload: Req<K>;
}

/** Responses are wrapped so errors cross the context boundary intact (with their i18n key for user errors). */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; key?: string; subs?: string[] };

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
  if (!result.ok) throw result.key ? new UserError(result.key, result.subs) : new Error(result.error);
  return result.data;
}
