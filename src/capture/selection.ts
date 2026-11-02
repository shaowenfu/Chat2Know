import { TEX_SOURCE, headerLanguage, htmlToMarkdown } from './markdown';
import { buildTextIndex, quoteFromRange, type TextQuote } from './text-quote';

export interface CapturedSelection {
  markdown: string;
  /** The selection word for word, for a protected quote: its text as shown, with formulas and code as their Markdown source. */
  words: string;
  quote: TextQuote;
  url: string;
  pageTitle: string;
}

// Elements that must be captured whole: a partial clone loses the LaTeX source or the code language.
const ATOMIC = `.katex-display, .katex, mjx-container, math, pre, [data-code-block], ${TEX_SOURCE}`;

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

/** `shown` is the selection's text as the browser lays it out (Selection.toString keeps line breaks between blocks). */
export function captureRange(range: Range, doc: Document, url: string, shown = range.toString()): CapturedSelection | null {
  const expanded = expandRange(range);
  const quote = quoteFromRange(expanded, doc.body, buildTextIndex(doc.body));
  if (!quote) return null;
  const container = doc.createElement('div');
  container.appendChild(expanded.cloneContents());
  // A cloned <pre> loses the header above it that names its language; carry the name over.
  const pres = Array.from(doc.querySelectorAll('pre')).filter((p) => expanded.intersectsNode(p));
  container.querySelectorAll('pre').forEach((clone, i) => {
    const lang = pres[i] && headerLanguage(pres[i]);
    if (lang && !clone.hasAttribute('data-language')) clone.setAttribute('data-language', lang);
  });
  const markdown = htmlToMarkdown(container) || quote.exact;
  // A formula's rendered text is not its words (KaTeX doubles it), so a selection with one keeps the Markdown.
  const words = container.querySelector(ATOMIC) ? markdown : plainWords(shown);
  return { markdown, words: words || quote.exact, quote, url, pageTitle: doc.title };
}

/** The selected text as the page shows it: line breaks kept, runs of spaces and blank lines collapsed. */
export function plainWords(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function captureSelection(doc: Document, url: string): CapturedSelection | null {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  return captureRange(sel.getRangeAt(0), doc, url, sel.toString());
}
