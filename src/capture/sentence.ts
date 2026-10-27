import { BLOCK_SELECTOR, buildTextIndex, rangeToSpan, spanToRange } from './text-quote';

/**
 * Expands a selection to the full sentence(s) around it, using the browser's
 * own Intl.Segmenter so Chinese, English and mixed text all work without
 * per-site rules. Selections that cross block elements are returned as-is.
 */
export function sentenceRange(range: Range, locale?: string): Range {
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element) : range.startContainer.parentElement;
  const doc = range.startContainer.ownerDocument;
  const block = startEl?.closest(BLOCK_SELECTOR) ?? doc?.body;
  if (!block || !block.contains(range.endContainer)) return range;

  const index = buildTextIndex(block);
  const [s, e] = rangeToSpan(index, range);
  if (s >= e) return range;

  let start = 0;
  let end = index.text.length;
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  for (const { index: at, segment } of segmenter.segment(index.text)) {
    const stop = at + segment.length;
    if (at <= s && s < stop) start = at;
    if (at < e && e <= stop) end = stop;
  }
  while (start < end && index.text[start] === ' ') start++;
  while (end > start && index.text[end - 1] === ' ') end--;
  return spanToRange(index, start, end) ?? range;
}
