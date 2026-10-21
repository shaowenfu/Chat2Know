import type { TextQuote } from './text-quote';

const MAX_WORDS = 8;
const EDGE_WORDS = 4;

function enc(s: string): string {
  // Commas and dashes are directive syntax inside a text fragment.
  return encodeURIComponent(s).replace(/-/g, '%2D').replace(/,/g, '%2C');
}

/** Builds a URL with a Text Fragment (#:~:text=) so the browser scrolls to and highlights the quote. */
export function textFragmentUrl(url: string, quote: TextQuote): string {
  const base = url.replace(/#:~:.*$/, '');
  const words = quote.exact.split(' ').filter(Boolean);
  if (words.length === 0) return base;
  const directive =
    words.length <= MAX_WORDS
      ? enc(words.join(' '))
      : `${enc(words.slice(0, EDGE_WORDS).join(' '))},${enc(words.slice(-EDGE_WORDS).join(' '))}`;
  return `${base}${base.includes('#') ? '' : '#'}:~:text=${directive}`;
}
