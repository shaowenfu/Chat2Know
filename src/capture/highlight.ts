import { anchorQuote, type TextQuote } from './text-quote';

const NAME = 'chat2know';
const STYLE_ID = 'chat2know-highlight-style';

/** Highlights a quote with the CSS Custom Highlight API (no DOM mutation of page content) and scrolls to it. */
export function highlightQuote(doc: Document, quote: TextQuote): boolean {
  const range = anchorQuote(quote, doc.body);
  if (!range) return false;
  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    CSS.highlights.set(NAME, new Highlight(range));
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `::highlight(${NAME}) { background: #ffe58a; color: #1f2328; }`;
      doc.head.appendChild(style);
    }
  }
  const target = range.startContainer.parentElement;
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  doc.documentElement.dataset.chat2knowHighlight = quote.exact.slice(0, 64);
  return true;
}
