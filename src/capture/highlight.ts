import { anchorQuote, anchorSpan, buildTextIndex, spanToRange, type TextQuote } from './text-quote';

const SOURCE = 'chat2know';
const ASK = 'chat2know-ask';
const STYLE_ID = 'chat2know-highlight-style';

// Highlights use the CSS Custom Highlight API, so page content is never mutated.
function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    `::highlight(${SOURCE}) { background: #ffe58a; color: #1f2328; }\n` +
    `::highlight(${ASK}) { text-decoration: underline dotted 2px rgba(130, 80, 223, 0.7); text-underline-offset: 3px; }`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS;

/** Highlights a quote and scrolls to it. */
export function highlightQuote(doc: Document, quote: TextQuote): boolean {
  const range = anchorQuote(quote, doc.body);
  if (!range) return false;
  if (supported()) {
    CSS.highlights.set(SOURCE, new Highlight(range));
    ensureStyle(doc);
  }
  range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  doc.documentElement.dataset.chat2knowHighlight = quote.exact.slice(0, 64);
  return true;
}

/** Adds a faint underline under a term the user wants to ask about later. */
export function underlineRange(doc: Document, range: Range): void {
  if (!supported()) return;
  ensureStyle(doc);
  const existing = CSS.highlights.get(ASK);
  if (existing) existing.add(range);
  else CSS.highlights.set(ASK, new Highlight(range));
}

/** Re-underlines ask-later terms on page load: anchor the sentence, then find the term inside it. */
export function underlineTerms(doc: Document, items: { term: string; quote: TextQuote }[]): number {
  if (items.length === 0) return 0;
  const index = buildTextIndex(doc.body);
  let count = 0;
  for (const { term, quote } of items) {
    const span = anchorSpan(quote, index);
    if (!span) continue;
    const at = index.text.slice(span[0], span[1]).toLowerCase().indexOf(term.toLowerCase());
    const range = at < 0 ? null : spanToRange(index, span[0] + at, span[0] + at + term.length);
    if (range) {
      underlineRange(doc, range);
      count++;
    }
  }
  return count;
}
