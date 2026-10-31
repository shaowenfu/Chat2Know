/**
 * LaTeX compared for "the same formula": spacing commands, \left / \right,
 * \displaystyle and whitespace do not count.
 */
export function normalizeLatex(tex: string): string {
  return tex
    .replace(/\\(?:left|right|displaystyle|textstyle)(?![a-zA-Z])/g, '')
    .replace(/\\[,;:! ]|\\q?quad(?![a-zA-Z])|~/g, '')
    .replace(/\s+/g, '');
}

/** Statements compared without case, spacing or a final full stop. */
export const normalizeStatement = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').replace(/[.。]\s*$/, '').trim();
