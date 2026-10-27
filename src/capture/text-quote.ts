/**
 * Text quote anchoring, after W3C Web Annotation's TextQuoteSelector.
 *
 * Both capture and re-anchoring read the page through the same normalized text
 * view: text nodes in document order, whitespace collapsed to single spaces, and
 * a virtual space between different block elements. Every normalized character
 * maps back to a (text node, offset) position, so quotes round-trip to DOM ranges.
 */

export interface TextQuote {
  exact: string;
  prefix: string;
  suffix: string;
}

export const QUOTE_CONTEXT = 32;

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);
export const BLOCK_SELECTOR =
  'address,article,aside,blockquote,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tbody,td,tfoot,th,thead,tr,ul';

/** Marks our own injected UI so it is never captured or anchored into. */
export const UI_ATTR = 'data-chat2know-ui';

interface Pos {
  node: number;
  offset: number;
}

export interface TextIndex {
  text: string;
  nodes: Text[];
  map: Pos[];
}

function accept(node: Text): boolean {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName) || el.hasAttribute(UI_ATTR)) return false;
  }
  return true;
}

export function buildTextIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const map: Pos[] = [];
  let text = '';
  let lastSpace = true; // suppresses leading whitespace
  let lastBlock: Element | null = null;

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    if (!accept(node) || node.data.length === 0) continue;
    const idx = nodes.push(node) - 1;
    const block = node.parentElement?.closest(BLOCK_SELECTOR) ?? null;
    if (block !== lastBlock && !lastSpace) {
      text += ' ';
      map.push({ node: idx, offset: 0 });
      lastSpace = true;
    }
    lastBlock = block;
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]!;
      if (/\s/.test(ch)) {
        if (lastSpace) continue;
        text += ' ';
        lastSpace = true;
      } else {
        text += ch;
        lastSpace = false;
      }
      map.push({ node: idx, offset: i });
    }
  }
  return { text, nodes, map };
}

function cmp(a: Pos, b: Pos): number {
  return a.node - b.node || a.offset - b.offset;
}

/** Converts a range boundary point to a position in the index's text-node space. */
function boundaryToPos(index: TextIndex, container: Node, offset: number): Pos {
  const direct = index.nodes.indexOf(container as Text);
  if (direct >= 0) return { node: direct, offset };
  const probe = (container.ownerDocument ?? (container as Document)).createRange();
  probe.setStart(container, offset);
  probe.collapse(true);
  for (let i = 0; i < index.nodes.length; i++) {
    // 1 means the text node starts after the boundary point.
    if (probe.comparePoint(index.nodes[i]!, 0) >= 0) return { node: i, offset: 0 };
  }
  return { node: index.nodes.length, offset: 0 };
}

/** Maps a DOM range to [start, end) in the index's normalized text, trimming edge whitespace. */
export function rangeToSpan(index: TextIndex, range: Range): [number, number] {
  const start = boundaryToPos(index, range.startContainer, range.startOffset);
  const end = boundaryToPos(index, range.endContainer, range.endOffset);
  let s = index.map.findIndex((p) => cmp(p, start) >= 0);
  if (s < 0) s = index.text.length;
  let e = index.map.findIndex((p) => cmp(p, end) >= 0);
  if (e < 0) e = index.text.length;
  // Trim whitespace at the edges of the selection.
  while (s < e && index.text[s] === ' ') s++;
  while (e > s && index.text[e - 1] === ' ') e--;
  return [s, e];
}

export function quoteFromRange(range: Range, root: Node, index = buildTextIndex(root)): TextQuote | null {
  const [s, e] = rangeToSpan(index, range);
  if (s >= e) return null;
  return {
    exact: index.text.slice(s, e),
    prefix: index.text.slice(Math.max(0, s - QUOTE_CONTEXT), s),
    suffix: index.text.slice(e, e + QUOTE_CONTEXT),
  };
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Maps [start, end) in the normalized text back to a DOM range. */
export function spanToRange(index: TextIndex, start: number, end: number): Range | null {
  if (start >= end || end > index.map.length) return null;
  const s = index.map[start]!;
  const e = index.map[end - 1]!;
  const first = index.nodes[s.node]!;
  const range = first.ownerDocument.createRange();
  range.setStart(first, s.offset);
  range.setEnd(index.nodes[e.node]!, e.offset + 1);
  return range;
}

/** Finds the best match for a quote in the normalized text, using prefix/suffix to pick among repeats. */
export function anchorSpan(quote: TextQuote, index: TextIndex): [number, number] | null {
  const { text } = index;
  if (!quote.exact) return null;
  let best = -1;
  let bestScore = -1;
  for (let at = text.indexOf(quote.exact); at >= 0; at = text.indexOf(quote.exact, at + 1)) {
    const before = text.slice(Math.max(0, at - quote.prefix.length), at);
    const after = text.slice(at + quote.exact.length, at + quote.exact.length + quote.suffix.length);
    const score = commonSuffix(before, quote.prefix) + commonPrefix(after, quote.suffix);
    if (score > bestScore) {
      best = at;
      bestScore = score;
    }
  }
  return best < 0 ? null : [best, best + quote.exact.length];
}

export function anchorQuote(quote: TextQuote, root: Node, index = buildTextIndex(root)): Range | null {
  const span = anchorSpan(quote, index);
  return span ? spanToRange(index, span[0], span[1]) : null;
}
