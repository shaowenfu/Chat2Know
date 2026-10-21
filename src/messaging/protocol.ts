/**
 * Typed message protocol between the content script, background and side panel.
 * Every message has a `type` and a `payload`; each type maps to exactly one response shape.
 */

export type Context = 'content' | 'background' | 'sidepanel';

export interface PageInfo {
  url: string;
  title: string;
  textLength: number;
}

export interface MessageMap {
  /** Health check. Any context can ping the background. */
  ping: { req: { from: Context }; res: { from: 'background'; echo: Context; at: number } };
  /** Side panel asks the background to read a tab (active tab when tabId is omitted). */
  'page/probe': { req: { tabId?: number }; res: PageInfo };
  /** Background asks the injected content script to describe its page. */
  'content/describe': { req: Record<string, never>; res: PageInfo };
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
