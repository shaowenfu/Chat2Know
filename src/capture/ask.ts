import { captureRange, type CapturedSelection } from './selection';
import { sentenceRange } from './sentence';
import { buildTextIndex, quoteFromRange } from './text-quote';

/** Everything needed to save an "ask later" question, captured before any UI steals the selection. */
export interface AskDraft {
  term: string;
  capture: CapturedSelection;
  termRange: Range;
}

const MAX_TERM = 120;

export function prepareAskDraft(doc: Document, url: string): AskDraft | null {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const termRange = sel.getRangeAt(0).cloneRange();
  const index = buildTextIndex(doc.body);
  const term = quoteFromRange(termRange, doc.body, index)?.exact;
  if (!term) return null;
  const capture = captureRange(sentenceRange(termRange, doc.documentElement.lang || undefined), doc, url);
  if (!capture) return null;
  return { term: term.length > MAX_TERM ? `${term.slice(0, MAX_TERM - 1)}…` : term, capture, termRange };
}
