import type { LlmClient } from '@/src/llm/client';
import { answerPrompt, parseSuggestion, suggestPrompt, type Suggestion, type SuggestionKind } from '@/src/llm/prompts';
import type { KeepDecision, Repository } from '@/src/db/repository';
import type { InboxItem, KNode } from '@/src/db/types';

/** How many recent decisions to show the model as examples of this user's taste. */
export const PREFERENCE_EXAMPLES = 8;

/** The question text sent to the model: the user's own, or a plain default about the term. */
export function questionOf(node: KNode, defaultQuestion: (term: string) => string): string {
  if (node.title) return node.title;
  if (!node.term) throw new Error('Question has neither text nor term');
  return defaultQuestion(node.term);
}

/** Answers a queued question. The answer goes to the inbox; the question stays open until kept or dismissed. */
export async function answerQuestion(
  repo: Repository,
  client: LlmClient,
  questionId: string,
  defaultQuestion: (term: string) => string,
): Promise<InboxItem> {
  const node = await repo.getNode(questionId);
  if (!node || node.type !== 'question') throw new Error('Question not found');
  const [source] = await repo.sourcesOf(questionId);
  const question = questionOf(node, defaultQuestion);
  const quote = source?.quoteExact ?? '';
  const answer = await client.chat(answerPrompt({ question, quote }));
  return repo.addInboxItem({ questionNodeId: questionId, question, quote, answer });
}

const summarize = (s: { titles: string[]; summary: string }) => `${s.titles[0]} — ${s.summary}`;

export async function suggestKeep(repo: Repository, client: LlmClient, inboxId: string): Promise<Suggestion> {
  const item = await repo.getInboxItem(inboxId);
  const examples = (await repo.recentPreferences(PREFERENCE_EXAMPLES)).map((p) => ({
    kind: p.questionType,
    suggested: p.suggestion,
    action: p.userAction,
    final: p.finalText,
  }));
  return client.json(suggestPrompt({ question: item.question, quote: item.quote, answer: item.answer, examples }), parseSuggestion);
}

/** Keeps the answer and records whether the user accepted or edited the suggestion. */
export async function confirmKeep(repo: Repository, inboxId: string, suggestion: Suggestion, decision: KeepDecision): Promise<KNode> {
  const node = await repo.keep(inboxId, decision);
  const accepted = suggestion.titles.includes(decision.title.trim()) && suggestion.summary === decision.summary.trim();
  await repo.addPreference({
    questionType: suggestion.kind,
    suggestion: summarize(suggestion),
    userAction: accepted ? 'accept' : 'edit',
    ...(accepted ? {} : { finalText: `${decision.title.trim()} — ${decision.summary.trim()}` }),
  });
  return node;
}

/**
 * Drops the question from the queue. Its answer stays in the inbox until it
 * expires, so it can still be kept. Declining a keep-worthy suggestion is a
 * "delete" signal; declining a curiosity is agreement.
 */
export async function dismissQuestion(repo: Repository, questionId: string, suggestion?: Suggestion): Promise<void> {
  await repo.deleteNode(questionId);
  if (!suggestion) return;
  const kind: SuggestionKind = suggestion.kind;
  await repo.addPreference({ questionType: kind, suggestion: summarize(suggestion), userAction: kind === 'curiosity' ? 'accept' : 'delete' });
}
