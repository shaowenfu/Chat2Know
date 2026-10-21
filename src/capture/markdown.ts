import TurndownService from 'turndown';

/**
 * HTML to Markdown with rules for what AI chat pages render:
 * KaTeX / MathJax / MathML back to LaTeX, code blocks with their language,
 * and tables as Markdown tables. No per-site selectors.
 */

const TEX = 'annotation[encoding="application/x-tex"]';
const MATH_TAGS = new Set(['MJX-CONTAINER', 'MATH']);

function isMathRoot(node: HTMLElement): boolean {
  if (node.classList?.contains('katex-display')) return true;
  if (node.classList?.contains('katex')) return !node.parentElement?.classList.contains('katex-display');
  if (MATH_TAGS.has(node.nodeName.toUpperCase())) return !node.parentElement?.closest('.katex, mjx-container');
  return false;
}

function isDisplayMath(node: HTMLElement): boolean {
  return (
    node.classList.contains('katex-display') ||
    node.getAttribute('display') === 'true' ||
    node.getAttribute('display') === 'block' ||
    node.querySelector('math[display="block"]') !== null
  );
}

function texOf(node: HTMLElement): string | null {
  const annotation = node.querySelector(TEX) ?? (node.matches?.(TEX) ? node : null);
  if (annotation?.textContent) return annotation.textContent.trim();
  const alt = node.getAttribute('alttext') ?? node.querySelector('math[alttext]')?.getAttribute('alttext');
  if (alt) return alt.trim();
  const latex = node.getAttribute('data-latex') ?? node.getAttribute('data-tex');
  return latex ? latex.trim() : null;
}

function mathMarkdown(tex: string, display: boolean): string {
  return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
}

const LANG_RE = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/;

function codeLanguage(pre: HTMLElement): string {
  const candidates = [pre.querySelector('code'), pre];
  for (const el of candidates) {
    if (!el) continue;
    const m = LANG_RE.exec(el.getAttribute('class') ?? '');
    if (m) return m[1]!.toLowerCase();
    const data = el.getAttribute('data-language') ?? el.getAttribute('data-lang');
    if (data) return data.toLowerCase();
  }
  return '';
}

function fence(code: string): string {
  let ticks = '```';
  while (code.includes(ticks)) ticks += '`';
  return ticks;
}

export function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    hr: '---',
  });

  const DROP = new Set(['BUTTON', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME']);
  td.remove((node) => DROP.has(node.nodeName.toUpperCase()));

  // Turndown gives later rules priority, so generic rules go first.
  td.addRule('scripts', {
    filter: (node) => node.nodeName === 'SCRIPT',
    replacement: () => '',
  });

  td.addRule('mathjax2', {
    filter: (node) => node.nodeName === 'SCRIPT' && /^math\/tex/.test(node.getAttribute('type') ?? ''),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      return mathMarkdown((el.textContent ?? '').trim(), /mode=display/.test(el.getAttribute('type') ?? ''));
    },
  });

  td.addRule('math', {
    filter: (node) => isMathRoot(node as HTMLElement),
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const tex = texOf(el);
      return tex ? mathMarkdown(tex, isDisplayMath(el)) : content;
    },
  });

  td.addRule('codeBlock', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: (_content, node) => {
      const pre = node as HTMLElement;
      const source = pre.querySelector('code') ?? pre;
      const code = (source.textContent ?? '').replace(/\n$/, '');
      const f = fence(code);
      return `\n\n${f}${codeLanguage(pre)}\n${code}\n${f}\n\n`;
    },
  });

  td.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => tableMarkdown(node as HTMLTableElement),
  });

  return td;
}

function cellMarkdown(cell: HTMLTableCellElement): string {
  return createTurndown()
    .turndown(cell.innerHTML)
    .replace(/\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function tableMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  if (rows.length === 0) return '';
  const cells = rows.map((tr) => Array.from(tr.children).filter((c): c is HTMLTableCellElement => /^T[DH]$/.test(c.tagName)).map(cellMarkdown));
  const width = Math.max(...cells.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  const [head, ...body] = cells;
  return `\n\n${[line(head!), line(Array(width).fill('---')), ...body.map(line)].join('\n')}\n\n`;
}

export function htmlToMarkdown(input: string | Node): string {
  return createTurndown().turndown(input as string | HTMLElement).trim();
}
