import { cosine } from './cosine';
import { levels, prerequisiteClosure, type Link } from './prereq';

/**
 * The three signals a learner's own questions give away (learning diagnosis, D3):
 * repeat (the same concept asked again and again, across conversations),
 * downshift (asking a prerequisite well below what the conversation is about),
 * circling (rephrasing the same confusion in one conversation without moving on).
 * Plain functions over recorded questions, their concept tags and the graph.
 */

export const WINDOW_DAYS = 14;
export const REPEAT_MIN_ASKS = 3;
export const REPEAT_MIN_CONVERSATIONS = 2;
export const DOWNSHIFT_MIN_LEVELS = 2;
export const CIRCLING_SIMILARITY = 0.8;
export const CIRCLING_MIN_RUN = 3;

export type SignalKind = 'repeat' | 'downshift' | 'circling';

export interface SignalAsk {
  id: string;
  conversationUrl: string;
  sentAt: number;
  vector?: number[];
}

/** A concept the questions point at, with how often each signal fired and the questions behind it. */
export interface Symptom {
  conceptId: string;
  signals: Partial<Record<Exclude<SignalKind, 'circling'>, number>>;
  askIds: string[];
}

/** Consecutive questions in one conversation that keep circling the same thing. */
export interface CirclingRun {
  conversationUrl: string;
  askIds: string[];
}

export interface SignalInput {
  asks: SignalAsk[];
  tags: { askId: string; conceptId: string }[];
  conceptIds: string[];
  edges: Link[];
  now: number;
}

export function detectSignals({ asks, tags, conceptIds, edges, now }: SignalInput): { symptoms: Symptom[]; circling: CirclingRun[] } {
  const recent = asks.filter((a) => a.sentAt >= now - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const byId = new Map(recent.map((a) => [a.id, a]));
  const recentTags = tags.filter((t) => byId.has(t.askId));
  const symptoms = new Map<string, Symptom>();
  const symptom = (conceptId: string) => {
    const s = symptoms.get(conceptId) ?? { conceptId, signals: {}, askIds: [] };
    symptoms.set(conceptId, s);
    return s;
  };
  const addAsk = (s: Symptom, askId: string) => s.askIds.includes(askId) || s.askIds.push(askId);

  // Repeat: one concept, several questions, more than one conversation.
  const asksOf = new Map<string, string[]>();
  for (const t of recentTags) asksOf.set(t.conceptId, [...(asksOf.get(t.conceptId) ?? []), t.askId]);
  for (const [conceptId, ids] of asksOf) {
    const conversations = new Set(ids.map((id) => byId.get(id)!.conversationUrl));
    if (ids.length < REPEAT_MIN_ASKS || conversations.size < REPEAT_MIN_CONVERSATIONS) continue;
    const s = symptom(conceptId);
    s.signals.repeat = ids.length;
    ids.forEach((id) => addAsk(s, id));
  }

  // Downshift: in one conversation, a question about a prerequisite far below another concept asked there.
  const level = levels(conceptIds, edges);
  const conceptsIn = new Map<string, Set<string>>();
  for (const t of recentTags) {
    const url = byId.get(t.askId)!.conversationUrl;
    conceptsIn.set(url, (conceptsIn.get(url) ?? new Set()).add(t.conceptId));
  }
  for (const t of recentTags) {
    const others = conceptsIn.get(byId.get(t.askId)!.conversationUrl)!;
    const below = [...others].some(
      (d) => d !== t.conceptId && prerequisiteClosure(d, edges).has(t.conceptId) && (level.get(d) ?? 0) - (level.get(t.conceptId) ?? 0) >= DOWNSHIFT_MIN_LEVELS,
    );
    if (!below) continue;
    const s = symptom(t.conceptId);
    s.signals.downshift = (s.signals.downshift ?? 0) + 1;
    addAsk(s, t.askId);
  }

  return { symptoms: [...symptoms.values()], circling: circlingRuns(recent) };
}

/** Runs of consecutive questions in one conversation whose neighbours are all similar. Needs question vectors. */
function circlingRuns(asks: SignalAsk[]): CirclingRun[] {
  const byConversation = new Map<string, SignalAsk[]>();
  for (const a of asks) byConversation.set(a.conversationUrl, [...(byConversation.get(a.conversationUrl) ?? []), a]);
  const runs: CirclingRun[] = [];
  for (const [conversationUrl, list] of byConversation) {
    list.sort((a, b) => a.sentAt - b.sentAt);
    let run: SignalAsk[] = [];
    const close = () => {
      if (run.length >= CIRCLING_MIN_RUN) runs.push({ conversationUrl, askIds: run.map((a) => a.id) });
      run = [];
    };
    for (const a of list) {
      const prev = run.at(-1);
      if (prev?.vector && a.vector && cosine(prev.vector, a.vector) >= CIRCLING_SIMILARITY) run.push(a);
      else {
        close();
        if (a.vector) run = [a];
      }
    }
    close();
  }
  return runs;
}
