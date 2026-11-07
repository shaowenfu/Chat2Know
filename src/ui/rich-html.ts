import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

/**
 * Markdown as safe HTML, for what the map shows (statements, protected quotes) and
 * for reports. `marked` reads the Markdown (and simple HTML); DOMPurify keeps only
 * formatting tags and http(s) links, which open in a new tab; scripts, styles,
 * event attributes, forms and frames are dropped. Images are kept only when asked
 * (a note captured from a page can hold one; a model's report cannot), from https
 * or an inline data image. Formulas are set aside before Markdown can read their
 * underscores and asterisks, and typeset with KaTeX after sanitizing.
 */

const TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub', 'code', 'pre', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'details', 'summary',
];

const LINK = /^https?:\/\//i;
const IMAGE = /^(?:https:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Links are http(s) only, whatever the image rule lets through.
  if (node.tagName === 'A' && node.hasAttribute('href') && !LINK.test(node.getAttribute('href')!)) node.removeAttribute('href');
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IMG') {
    if (!IMAGE.test(node.getAttribute('src') ?? '')) node.remove();
    else {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  }
});

// Displayed ($$…$$, \[…\]) before inline ($…$, \(…\)); a lone $ in prose stays text.
const FORMULA = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
const slot = (i: number) => `C2KMATH${i}X`;

/** `images`: keep a page's images (notes only). `breaks`: a single line break is a break (notes keep their lines). */
export function richHtml(markdown: string, options: { images?: boolean; breaks?: boolean } = {}): string {
  // Unsupported, DOMPurify hands back its input untouched: never show that.
  if (!DOMPurify.isSupported) throw new Error('HTML sanitizing is not available here');
  const formulas: { tex: string; display: boolean }[] = [];
  const text = markdown.replace(FORMULA, (_m, d1?: string, d2?: string, i1?: string, i2?: string) =>
    slot(formulas.push({ tex: (d1 ?? d2 ?? i1 ?? i2)!.trim(), display: d1 !== undefined || d2 !== undefined }) - 1),
  );
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: options.breaks ?? false }), {
    ALLOWED_TAGS: options.images ? [...TAGS, 'img'] : TAGS,
    ALLOWED_ATTR: options.images ? ['href', 'title', 'src', 'alt'] : ['href', 'title'],
    // Images are checked by the hook above; links must be http(s).
    ALLOWED_URI_REGEXP: options.images ? /^(?:https?:\/\/|data:image\/)/i : LINK,
  });
  return html.replace(/C2KMATH(\d+)X/g, (_m, i: string) => {
    const f = formulas[Number(i)]!;
    return katex.renderToString(f.tex, { displayMode: f.display, throwOnError: false });
  });
}
