/**
 * Typed message protocol between the content script, background and side panel.
 * Every message has a `type` and a `payload`; each type maps to exactly one response shape.
 */

import { UserError } from '@/src/errors';
import type { Ask } from '@/src/db/types';
import type { SiteSettings } from '@/src/sites/settings';
import type { UiLang } from '@/src/i18n';
import type { TextQuote } from '@/src/capture/text-quote';
import type { ItemType } from '@/src/db/types';
import type { RecordResult } from '@/src/services/record';
import type { Place } from '@/src/services/relocate';
import type { GapCard } from '@/src/services/gaps';
import type { Gap } from '@/src/db/types';
import type { MapTree, OutlineNode } from '@/src/graph/tree';
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

  // The extension's language: the browser's, or the user's pick
  'ui/getLang': { req: Record<string, never>; res: UiLang };
  'ui/setLang': { req: { lang: UiLang }; res: null };

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
  'map/record': {
    req: { itemType: ItemType; title: string; latex?: string; quote: TextQuote; pageTitle: string; force?: boolean; createMap?: boolean };
    res: RecordResult;
  };
  /** Subjects in map order, with how many items each holds and when the newest was recorded. */
  'map/subjects': { req: Record<string, never>; res: SubjectSummary[] };
  'map/tree': { req: { subjectId: string }; res: MapTree };
  /** A drag in the map: a node into a structure node, before `beforeId` or last. */
  'map/moveNode': { req: { id: string; parentId: string; beforeId?: string }; res: { group: string } };
  'map/edit': { req: { id: string; title?: string; latex?: string }; res: { group: string } };
  /** Soft delete; a section's contents move up a level. */
  'map/remove': { req: { id: string }; res: { group: string } };
  /** The user creates a map (title may be empty: named from its content once) and it opens. */
  'map/addSubject': { req: { title: string }; res: { id: string } };
  /** The user opens a map: everything recorded goes into it. */
  'maps/open': { req: { id: string }; res: null };
  'map/addSection': { req: { parentId: string; title: string; beforeId?: string }; res: { id: string } };
  /** An item the user types in on the full page (a formula's LaTeX, or a statement). */
  'map/addItem': { req: { parentId: string; itemType: ItemType; text: string }; res: { id: string } };
  /** "清空所有数据". */
  'map/clear': { req: Record<string, never>; res: null };
  /** Opens the item's conversation in a new tab, scrolled to the quote. */
  'map/openSource': { req: { itemId: string }; res: null };
  /** The "改位置" picker: where the item is now and three other places. */
  'map/placeOptions': { req: { itemId: string }; res: { now: string[]; places: Place[] } };
  'map/searchPlaces': { req: { query: string }; res: Place[] };
  /** The user moves an item to a place, or into a new topic there. */
  'map/moveItem': { req: { itemId: string; placeId: string; newTopic?: string }; res: { group: string; path: string[] } };
  /** Undoes one write (a toast's "撤销"), or the latest one (Ctrl+Z). */
  'map/undo': { req: { group?: string }; res: { undone: boolean } };
  /** Background -> site script: record the page's selection (Alt+S, context menu). */
  'site/recordSelection': { req: { as?: 'quote' }; res: null };
  /** Background -> site script: automatic placement moved a recorded item (or failed, and it stays). */
  'site/placed': { req: { itemId: string; path?: string[]; error?: string }; res: null };

  // Laying an outline over a subject (asked once per subject)
  /** Whether to offer an outline for the subject, and the one already proposed. */
  'outline/state': { req: { subjectId: string }; res: { offer: boolean; outline?: OutlineNode[] } };
  /** Proposes the standard outline, or the pasted table of contents as one. */
  'outline/propose': { req: { subjectId: string; toc?: string }; res: OutlineNode[] };
  /** "铺上大纲": lays the proposed outline as grey sections and files what waits in 待归位. */
  'outline/apply': { req: { subjectId: string }; res: { group: string } };
  /** "不用": never asked again for this subject. */
  'outline/decline': { req: { subjectId: string }; res: null };

  // Gaps found in the recorded questions
  /** Looks at new questions now (the side panel opened). */
  'gaps/check': { req: Record<string, never>; res: null };
  /** The subject's orange marks, and the one gap to ask about now (at most one a day). */
  'gaps/view': { req: { subjectId: string }; res: { marks: string[]; card?: GapCard } };
  /** The subject's orange marks only (the full page). */
  'gaps/marks': { req: { subjectId: string }; res: string[] };
  /** The open gap on a section the user picked on the full page, if any; not counted as asking. */
  'gaps/forSection': { req: { sectionId: string }; res: GapCard | null };
  'gaps/proposeFill': { req: { gapId: string }; res: NonNullable<Gap['proposal']> };
  /** "整理进来", minus the proposal items the user unticked. */
  'gaps/fill': { req: { gapId: string; skip: number[] }; res: { group: string } };
  'gaps/quiz': { req: { gapId: string }; res: { question: string } };
  'gaps/judge': { req: { gapId: string; answer: string }; res: { correct: boolean; feedback: string } };
  /** "不用": quiet for 30 days. */
  'gaps/dismiss': { req: { gapId: string }; res: null };

  // The map's data
  /** The whole map as a file's text; Markdown and OPML leave grey outline nodes out unless asked. */
  'map/export': { req: { format: 'json' | 'markdown' | 'opml'; includeGrey?: boolean }; res: string };
  /** An export merges into the maps (nodes with the same id are replaced). */
  'map/import': { req: { json: string }; res: { nodes: number } };

  // Background -> extension pages (broadcast)
  /** Data or settings changed; open pages reload. */
  'event/dataChanged': { req: Record<string, never>; res: null };
}

export interface SubjectSummary {
  id: string;
  title: string;
  items: number;
  latest: number; // createdAt of its newest item, 0 when it has none
  open: boolean; // the map the user opened
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
