import katex from 'katex';
import 'katex/dist/katex.min.css';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A formula typeset; LaTeX KaTeX cannot read shows as its source, marked by KaTeX. */
export const formulaHtml = (latex: string) => katex.renderToString(latex, { throwOnError: false });

/** A statement: plain text with its $…$ formulas typeset. */
export function textHtml(text: string): string {
  return text
    .split(/(\$[^$\n]+\$)/g)
    .map((part) => (/^\$[^$\n]+\$$/.test(part) ? formulaHtml(part.slice(1, -1)) : escape(part)))
    .join('');
}

/** An item as the map shows it: a typeset formula, a statement with its formulas typeset, or a quote exactly as written. */
export function itemHtml(n: { itemType?: string; latex?: string; title: string }): string {
  if (n.itemType === 'formula') return formulaHtml(n.latex ?? '');
  if (n.itemType === 'quote') return escape(n.title);
  return textHtml(n.title);
}
