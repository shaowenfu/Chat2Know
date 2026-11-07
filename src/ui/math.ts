import katex from 'katex';
import 'katex/dist/katex.min.css';
import { richHtml } from './rich-html';

/** A formula typeset; LaTeX KaTeX cannot read shows as its source, marked by KaTeX. */
export const formulaHtml = (latex: string) => katex.renderToString(latex, { throwOnError: false });

/**
 * An item as the map shows it: a typeset formula, or a statement or quote read as
 * Markdown (tables, lists, bold, displayed formulas and images from the page),
 * sanitized (src/ui/rich-html.ts).
 */
export function itemHtml(n: { itemType?: string; latex?: string; title: string }): string {
  if (n.itemType === 'formula') return formulaHtml(n.latex ?? '');
  return richHtml(n.title, { images: true, breaks: true });
}
