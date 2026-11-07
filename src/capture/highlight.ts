import { anchorQuote, type TextQuote } from './text-quote';

const SOURCE = 'chat2know';
const STYLE_ID = 'chat2know-highlight-style';

// Highlights use the CSS Custom Highlight API, so page content is never mutated.
function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `::highlight(${SOURCE}) { background: #ffe58a; color: #1f2328; }`;
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
