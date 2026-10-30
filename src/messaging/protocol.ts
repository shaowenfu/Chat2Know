/**
 * Typed message protocol between the content script, background and side panel.
 * Every message has a `type` and a `payload`; each type maps to exactly one response shape.
 */

import type { CapturedSelection } from '@/src/capture/selection';
import { UserError } from '@/src/errors';
import type { TextQuote } from '@/src/capture/text-quote';
import type { AskLaterResult, CaptureType, ImportResult, KeepDecision, PageQuestion } from '@/src/db/repository';
import type { Ask, InboxItem, Mastery, QuizItem, Review, Verdict } from '@/src/db/types';
import type { RecordingSettings } from '@/src/recording/settings';
import type { CandidateCard, Suggestion } from '@/src/llm/prompts';
import type { Placement } from '@/src/services/placement';
import type { ExplainResult } from '@/src/services/explain';
import type { PublicSettings } from '@/src/llm/settings';
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
  /** Save an ask-later question. Never calls a model. */
  'ask/save': { req: { term: string; question: string; capture: CapturedSelection }; res: AskLaterResult };
  'ask/update': { req: { id: string; question: string }; res: null };
  /** Open the ask-later prompt in a tab (shortcut and context-menu path). */
  'ask/fromTab': { req: { tabId?: number }; res: null };
  'ask/forUrl': { req: { url: string }; res: PageQuestion[] };
  /** Ask now: save the question and answer it right away into the inbox. Never touches the host page. */
  'ask/now': { req: { term: string; question: string; capture: CapturedSelection }; res: InboxItem };
  /** A follow-up question on a card or answer, answered right away; becomes its child. */
  'ask/followUp': { req: { parentId: string; question: string }; res: InboxItem };
  /** Answer a queued question with the model; the answer lands in the inbox. */
  'ask/answer': { req: { questionId: string }; res: InboxItem };
  /** Drop a question from the queue (its answer stays in the inbox until it expires). */
  'ask/dismiss': { req: { questionId: string; suggestion?: Suggestion }; res: null };
  'inbox/list': { req: Record<string, never>; res: InboxItem[] };
  'keep/suggest': { req: { inboxId: string }; res: Suggestion };
  'keep/confirm': { req: { inboxId: string; suggestion: Suggestion; decision: KeepDecision }; res: { nodeId: string } };
  'nodes/confirmTitle': { req: { id: string; title: string }; res: null };
  'nodes/retryDistill': { req: { id: string }; res: null };
  /** Move a card under another (before a sibling, or last), or to the top level with parentId null. */
  'nodes/move': { req: { id: string; parentId: string | null; beforeId?: string }; res: null };
  /** Parent and duplicate suggestions for a card; null when no embedding model is configured. */
  'place/suggest': { req: { nodeId: string }; res: Placement | null };
  'nodes/merge': { req: { duplicateId: string; targetId: string }; res: null };
  /** Organize a whole page (active tab when omitted) into candidate cards. */
  'organize/page': { req: { tabId?: number }; res: { cards: CandidateCard[]; url: string; pageTitle: string } };
  /** Organize pasted text into candidate cards. */
  'organize/text': { req: { text: string }; res: { cards: CandidateCard[] } };
  'organize/keep': {
    req: { cards: { title: string; summary: string; quote: string }[]; page?: { url: string; pageTitle: string } };
    res: { kept: number };
  };
  'nodes/setMastery': { req: { id: string; mastery: Mastery | null }; res: null };
  'quiz/due': { req: Record<string, never>; res: QuizItem[] };
  'quiz/grade': { req: { nodeId: string; answer: string; verdict: Verdict }; res: Review };
  /** A problem that needs the card's knowledge (apply mode). */
  'quiz/problem': { req: { nodeId: string }; res: { problem: string } };
  /** Model judge; with `problem`, the answer is judged as a solution to it (apply mode). */
  'quiz/judge': { req: { nodeId: string; answer: string; problem?: string }; res: Review };
  /** "Explain it to me": check an explanation of a card and its branch; every kept card in it gets a review. */
  'explain/check': { req: { nodeId: string; explanation: string }; res: ExplainResult };
  'stats/get': { req: Record<string, never>; res: { masteredThisWeek: number; due: number; mustKnow: number; openQuestions: number } };
  'settings/get': { req: Record<string, never>; res: PublicSettings };
  /** Omitting apiKey keeps the stored key. */
  'settings/save': { req: { baseUrl: string; model: string; embeddingModel: string; apiKey?: string }; res: PublicSettings };
  'settings/test': { req: Record<string, never>; res: { reply: string } };
  'nodes/list': { req: Record<string, never>; res: NodeView[] };
  'nodes/delete': { req: { id: string }; res: null };
  /** Open a source page and highlight the quote. */
  'source/open': { req: { sourceId: string }; res: { tabId: number; highlighted: boolean } };
  'data/exportJson': { req: Record<string, never>; res: string };
  'data/exportMarkdown': { req: Record<string, never>; res: string };
  'data/importJson': { req: { json: string }; res: ImportResult };

  // Recording the user's sent questions (learning diagnosis)
  'recording/get': { req: Record<string, never>; res: RecordingSettings };
  /** Sets the sites to record on. The side panel requests their host permission first. */
  'recording/setOrigins': { req: { origins: string[] }; res: RecordingSettings };
  'recording/setPaused': { req: { paused: boolean }; res: RecordingSettings };
  /** From the recorder: a question the user just sent on the sender's page. Stored only if the background's gate allows. */
  'asks/record': { req: { text: string }; res: { recorded: boolean } };
  'asks/list': { req: Record<string, never>; res: Ask[] };
  'asks/delete': { req: { id: string }; res: null };
  'asks/clear': { req: Record<string, never>; res: null };
  /** Stop recording a conversation and delete what was recorded in it. */
  'asks/exclude': { req: { conversationUrl: string }; res: RecordingSettings };
  'asks/export': { req: Record<string, never>; res: string };

  // Background -> content script
  'content/capture': { req: Record<string, never>; res: CapturedSelection | null };
  'content/askLater': { req: Record<string, never>; res: null };
  'content/pageMarkdown': { req: Record<string, never>; res: { markdown: string; url: string; pageTitle: string } };
  'content/highlight': { req: { quote: TextQuote }; res: { found: boolean } };

  // Background -> side panel (broadcast)
  /** Nodes, inbox or settings changed; the side panel reloads. */
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
