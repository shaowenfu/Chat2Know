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
