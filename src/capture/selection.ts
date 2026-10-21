import { htmlToMarkdown } from './markdown';
import { buildTextIndex, quoteFromRange, type TextQuote } from './text-quote';

export interface CapturedSelection {
  markdown: string;
  quote: TextQuote;
  url: string;
  pageTitle: string;
}

// Elements that must be captured whole: a partial clone loses the LaTeX source or the code language.
const ATOMIC = '.katex-display, .katex, mjx-container, math, pre';

function closestEl(node: Node, selector: string): Element | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest(selector) ?? null;
}

/** Widens a range so it never cuts through a formula or code block. */
export function expandRange(range: Range): Range {
  const r = range.cloneRange();
  const start = closestEl(r.startContainer, ATOMIC);
  if (start) r.setStartBefore(outermost(start));
  const end = closestEl(r.endContainer, ATOMIC);
  if (end) r.setEndAfter(outermost(end));
  return r;
}

function outermost(el: Element): Element {
  let top = el;
  for (let p = el.parentElement?.closest(ATOMIC); p; p = p.parentElement?.closest(ATOMIC)) top = p;
  return top;
}

export function captureRange(range: Range, doc: Document, url: string): CapturedSelection | null {
  const expanded = expandRange(range);
  const quote = quoteFromRange(expanded, doc.body, buildTextIndex(doc.body));
  if (!quote) return null;
  const container = doc.createElement('div');
  container.appendChild(expanded.cloneContents());
  const markdown = htmlToMarkdown(container) || quote.exact;
  return { markdown, quote, url, pageTitle: doc.title };
}

export function captureSelection(doc: Document, url: string): CapturedSelection | null {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  return captureRange(sel.getRangeAt(0), doc, url);
}
