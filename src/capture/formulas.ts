import { TEX_SOURCE, isDisplayMath, isMathRoot, texOf } from './markdown';

/** Everything that can be the root of a rendered formula; the same rules as the Markdown converter. */
const CANDIDATES = `.katex-display, .katex, mjx-container, math, ${TEX_SOURCE}`;

export interface FormulaBlock {
  el: HTMLElement;
  latex: string;
}

/** Display formulas (on a line of their own) in document order, outermost element each, outside editors. */
export function displayFormulas(root: ParentNode): FormulaBlock[] {
  const out: FormulaBlock[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES))) {
    if (out.some((f) => f.el.contains(el)) || !isMathRoot(el) || !isDisplayMath(el)) continue;
    if (el.closest('[contenteditable="true"], textarea')) continue;
    const latex = texOf(el);
    if (latex) out.push({ el, latex });
  }
  return out;
}
