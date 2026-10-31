/**
 * Typed message protocol between the content script, background and side panel.
 * Every message has a `type` and a `payload`; each type maps to exactly one response shape.
 */

import { UserError } from '@/src/errors';
import type { Ask } from '@/src/db/types';
import type { RecordingSettings } from '@/src/recording/settings';
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

  // Recording the user's sent questions
  'recording/get': { req: Record<string, never>; res: RecordingSettings };
  /** Sets the sites to record on. The page requests their host permission first. */
  'recording/setOrigins': { req: { origins: string[] }; res: RecordingSettings };
  'recording/setPaused': { req: { paused: boolean }; res: RecordingSettings };
  /** From the recorder: a question the user just sent on the sender's page. Stored only if the background's gate allows. */
  'asks/record': { req: { text: string }; res: { recorded: boolean } };
  'asks/list': { req: Record<string, never>; res: Ask[] };
  'asks/delete': { req: { id: string }; res: null };
  'asks/clear': { req: Record<string, never>; res: null };
  /** Stop recording a conversation and delete what was recorded in it. */
  'asks/exclude': { req: { conversationUrl: string }; res: RecordingSettings };

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
