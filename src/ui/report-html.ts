import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';

/**
 * A model-written report as safe HTML: Markdown (and the simple HTML the prompt
 * allows) through `marked`, then DOMPurify keeps only formatting tags and http(s)
 * links (which open in a new tab); scripts, styles, event attributes, images,
 * forms and frames are dropped. Formulas are set aside before Markdown can read
 * their underscores and asterisks, and typeset with KaTeX after sanitizing.
 */

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sup', 'sub', 'code', 'pre', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'details', 'summary',
];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Displayed ($$…$$, \[…\]) before inline ($…$, \(…\)); a lone $ in prose stays text.
const FORMULA = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
const slot = (i: number) => `C2KMATH${i}X`;

export function reportHtml(markdown: string): string {
  // Unsupported, DOMPurify hands back its input untouched: never show that.
  if (!DOMPurify.isSupported) throw new Error('HTML sanitizing is not available here');
  const formulas: { tex: string; display: boolean }[] = [];
  const text = markdown.replace(FORMULA, (_m, d1?: string, d2?: string, i1?: string, i2?: string) =>
    slot(formulas.push({ tex: (d1 ?? d2 ?? i1 ?? i2)!.trim(), display: d1 !== undefined || d2 !== undefined }) - 1),
  );
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }), {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
  return html.replace(/C2KMATH(\d+)X/g, (_m, i: string) => {
    const f = formulas[Number(i)]!;
    return katex.renderToString(f.tex, { displayMode: f.display, throwOnError: false });
  });
}
