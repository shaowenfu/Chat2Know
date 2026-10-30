/**
 * Rebuilds LaTeX from KaTeX's rendered HTML, for sites that keep no TeX source in
 * the page (Kimi, 2026-10: only .katex-html, no MathML annotation, no attribute).
 *
 * KaTeX lays out stacked parts (fractions, scripts, limits, roots) as a .vlist whose
 * items run bottom to top. Reading them in that order gives the structure back;
 * everything else is the visible symbols in order. The result renders the same
 * formula, though it is not always the author's exact source.
 */

const SKIP = ['strut', 'pstrut', 'vlist-s', 'frac-line', 'hide-tail', 'katex-mathml', 'nulldelimiter'];
const FONTS: Record<string, string> = { mathbf: '\\mathbf', boldsymbol: '\\boldsymbol', mathrm: '\\mathrm', mathbb: '\\mathbb', mathcal: '\\mathcal' };
const ACCENTS: Record<string, string> = { '^': '\\hat', 'ˆ': '\\hat', '~': '\\tilde', '˜': '\\tilde', 'ˉ': '\\bar', '¯': '\\bar', '˙': '\\dot', '¨': '\\ddot', 'ˇ': '\\check', '→': '\\vec' };
// KaTeX's built-in operator names; any other upright operator came from \\operatorname.
const OPERATORS = new Set(
  'arccos arcsin arctan arg cos cosh cot coth csc deg det dim exp gcd hom inf ker lg lim liminf limsup ln log max min Pr sec sin sinh sup tan tanh'.split(' '),
);
const ESCAPE: Record<string, string> = { '{': '\\{', '}': '\\}', '#': '\\#', '%': '\\%', '&': '\\&', _: '\\_', '^': '\\^{}' };

export function katexHtmlTex(html: Element): string {
  return tex(html).replace(/\s+/g, ' ').trim();
}

function tex(node: Node): string {
  if (node.nodeType === 3) {
    const text = (node.textContent ?? '').replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
    // \ue020 is the slash KaTeX overlays for \not (\neq, \notin).
    return text.replace(/[{}#%&_^]/g, (c) => ESCAPE[c]!).replace(/\ue020/g, '\\not ');
  }
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const cls = el.classList;
  if (SKIP.some((c) => cls.contains(c))) return '';
  if (cls.contains('mspace')) return ' ';
  if (cls.contains('mfrac')) {
    const [den, num] = vlistItems(el).filter((i) => i.textContent?.replace(/\u200b/g, '').trim());
    return `\\frac{${tex(num!)}}{${tex(den!)}}`;
  }
  if (cls.contains('msupsub')) return scripts(el);
  if (cls.contains('op-limits')) {
    const items = vlistItems(el);
    const op = items.findIndex((i) => i.querySelector('.op-symbol'));
    const sub = items.slice(0, op).map(tex).join('');
    const sup = items.slice(op + 1).map(tex).join('');
    return `${tex(items[op]!)}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''} `;
  }
  if (cls.contains('sqrt')) {
    const radicand = vlistItems(el).find((i) => !i.querySelector('.hide-tail'));
    return `\\sqrt{${radicand ? tex(radicand) : ''}}`;
  }
  if (cls.contains('mtable')) return matrix(el);
  if (cls.contains('accent')) {
    const items = vlistItems(el);
    const body = items.find((i) => i.querySelector('.accent-body'));
    const base = items.find((i) => i !== body);
    const command = ACCENTS[body?.textContent?.trim() ?? ''];
    if (command && base) return `${command}{${tex(base)}}`;
  }
  // Any other stack (\underbrace, \overset): read top to bottom.
  if (cls.contains('vlist')) return Array.from(el.children).reverse().map(tex).join(' ');
  if (cls.contains('text') && cls.contains('mord')) return `\\text{${el.textContent ?? ''}}`;
  const font = Object.keys(FONTS).find((f) => cls.contains(f));
  if (font && el.children.length === 0) return `${FONTS[font]}{${children(el)}}`;
  // Named operators (\log, \max, \sin) render as a .mop holding only letters.
  const word = el.textContent ?? '';
  if (cls.contains('mop') && !el.querySelector('.msupsub, .vlist-t') && /^[A-Za-z]{2,}$/.test(word)) {
    return OPERATORS.has(word) ? `\\${word} ` : `\\operatorname{${word}}`;
  }
  return children(el);
}

function children(el: Element): string {
  return Array.from(el.childNodes).map(tex).join('');
}

/** Arrays are laid out column by column, each column a vlist of its cells from the top row down. */
function matrix(el: Element): string {
  const columns = Array.from(el.children)
    .filter((c) => /(?:^|\s)col-align-/.test(c.className))
    .map((c) => vlistItems(c).map((cell) => tex(cell).trim()));
  const rows = Math.max(0, ...columns.map((c) => c.length));
  const lines = Array.from({ length: rows }, (_, r) => columns.map((c) => c[r] ?? '').join(' & '));
  return `\\begin{matrix} ${lines.join(' \\\\ ')} \\end{matrix}`;
}

/** A sub/superscript block: one vlist item is the subscript, or the superscript when there is no depth (vlist-t2 marks depth). */
function scripts(el: Element): string {
  const items = vlistItems(el);
  const hasDepth = el.querySelector('.vlist-t')?.classList.contains('vlist-t2') ?? false;
  const [sub, sup] = !hasDepth ? [undefined, items[0]] : items.length > 1 ? [items[0], items[1]] : [items[0], undefined];
  return `${sub ? `_{${tex(sub)}}` : ''}${sup ? `^{${tex(sup)}}` : ''}`;
}

/** The stacked items of the element's own vlist, bottom first. */
function vlistItems(el: Element): Element[] {
  const t = Array.from(el.children).find((c) => c.classList.contains('vlist-t'));
  const r = t && Array.from(t.children).find((c) => c.classList.contains('vlist-r'));
  const list = r && Array.from(r.children).find((c) => c.classList.contains('vlist'));
  return list ? Array.from(list.children) : [];
}
