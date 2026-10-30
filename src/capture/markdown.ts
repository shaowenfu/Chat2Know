import TurndownService from 'turndown';

/**
 * HTML to Markdown with rules for what AI chat pages render:
 * KaTeX / MathJax / MathML back to LaTeX, code blocks with their language,
 * and tables as Markdown tables. No per-site selectors.
 */

const TEX = 'annotation[encoding="application/x-tex"]';
const MATH_TAGS = new Set(['MJX-CONTAINER', 'MATH']);
/**
 * Attributes chat sites put the LaTeX source in, on a wrapper around the rendered
 * KaTeX (seen on real pages, 2026-10: ChatGPT data-math-source, Gemini data-math,
 * Doubao copy-text). They are checked before the KaTeX annotation, which some
 * sites render empty.
 */
const TEX_ATTRS = ['data-math-source', 'data-math', 'copy-text', 'data-latex', 'data-tex'];
export const TEX_SOURCE = TEX_ATTRS.map((a) => `[${a}]`).join(', ');

// The wrapper holds rendered math: KaTeX, MathML, or an SVG image (Doubao renders some formulas as SVG).
const hasTexSource = (node: HTMLElement) =>
  TEX_ATTRS.some((a) => node.hasAttribute?.(a)) &&
  (node.querySelector('.katex, math, svg') !== null || /(?:^|\s)math-(?:inline|display|block)(?:\s|$)/.test(node.className ?? ''));

function isMathRoot(node: HTMLElement): boolean {
  if (hasTexSource(node)) return true;
  if (node.classList?.contains('katex-display')) return true;
  if (node.classList?.contains('katex')) return !node.parentElement?.classList.contains('katex-display');
  if (MATH_TAGS.has(node.nodeName.toUpperCase())) return !node.parentElement?.closest('.katex, mjx-container');
  return false;
}

function isDisplayMath(node: HTMLElement): boolean {
  return (
    node.classList.contains('katex-display') ||
    node.querySelector('.katex-display') !== null ||
    node.getAttribute('data-math-display') === 'true' ||
    node.getAttribute('display') === 'true' ||
    node.getAttribute('display') === 'block' ||
    node.querySelector('math[display="block"]') !== null
  );
}

/** Strips the delimiters some sites keep in the source: \( \), \[ \], $$ $$, $ $. */
function bareTex(source: string): string {
  const s = source.trim();
  const m = /^(?:\\\(([\s\S]*)\\\)|\\\[([\s\S]*)\\\]|\$\$([\s\S]*)\$\$|\$([\s\S]*)\$)$/.exec(s);
  return (m ? (m[1] ?? m[2] ?? m[3] ?? m[4])! : s).trim();
}

function texOf(node: HTMLElement): string | null {
  for (const attr of TEX_ATTRS) {
    const source = node.getAttribute(attr);
    if (source?.trim()) return bareTex(source);
  }
  const annotation = node.querySelector(TEX) ?? (node.matches?.(TEX) ? node : null);
  if (annotation?.textContent) return annotation.textContent.trim();
  const alt = node.getAttribute('alttext') ?? node.querySelector('math[alttext]')?.getAttribute('alttext');
  if (alt) return alt.trim();
  return null;
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
  return headerLanguage(pre);
}

/** Language names a code block header may show. Only these count, so buttons like "Copy" never do. */
const LANGUAGES = new Set(
  'python javascript typescript js ts jsx tsx java c cpp c++ csharp c# go rust ruby php swift kotlin scala r matlab sql bash shell sh zsh powershell html css scss json yaml yml xml markdown latex tex lua perl haskell julia dart dockerfile makefile toml ini diff'.split(' '),
);

/**
 * Many sites put the language in a header bar right above the <pre> (DeepSeek, Gemini, 2026-10).
 * The header is the element just before the <pre>, or before the nearest ancestor that still
 * holds only this one code block, when it is short and has a leaf naming a language.
 */
function codeHeader(pre: Element): { header: Element; language: string } | null {
  let node: Element = pre;
  for (let i = 0; i < 4; i++) {
    const header = node.previousElementSibling;
    if (header) {
      if (header.querySelector('pre') || (header.textContent ?? '').trim().length > 80) return null;
      for (const el of Array.from(header.querySelectorAll('*'))) {
        const name = el.children.length === 0 ? el.textContent?.trim().toLowerCase() : undefined;
        if (name && LANGUAGES.has(name)) return { header, language: name };
      }
      return null;
    }
    const parent = node.parentElement;
    if (!parent || parent.querySelectorAll('pre').length !== 1) return null;
    node = parent;
  }
  return null;
}

export function headerLanguage(pre: Element): string {
  return codeHeader(pre)?.language ?? '';
}

function isCodeHeader(node: HTMLElement): boolean {
  const next = node.nextElementSibling;
  if (!next) return false;
  const pres = next.tagName === 'PRE' ? [next] : Array.from(next.querySelectorAll('pre'));
  return pres.length === 1 && codeHeader(pres[0]!)?.header === node;
}

/**
 * Code blocks that are not a <pre> (ChatGPT, 2026-10): a [data-code-block] wrapper
 * with a header bar marked data-markdown-copy="exclude" whose label names the language.
 */
function codeBlockLanguage(block: HTMLElement): string {
  const bar = block.querySelector('[data-markdown-copy="exclude"]');
  const label = bar && Array.from(bar.querySelectorAll('*')).find((el) => el.children.length === 0 && el.textContent?.trim());
  const name = label?.textContent?.trim().toLowerCase() ?? '';
  return LANGUAGES.has(name) ? name : ''; // "Plain text" and other phrases mean no language
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
    // Keep line breaks in <code> that is not inside a <pre> (ChatGPT code blocks).
    preformattedCode: true,
    // Turndown drops elements without text before any rule runs; a formula drawn as an
    // SVG has no text but keeps its LaTeX in an attribute.
    blankReplacement: (_content, node) => {
      const el = node as HTMLElement;
      if (hasTexSource(el)) {
        const tex = texOf(el);
        if (tex) return mathMarkdown(tex, isDisplayMath(el));
      }
      return (node as { isBlock?: boolean }).isBlock ? '\n\n' : '';
    },
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

  // Parts a site marks as excluded from copying (toolbars, labels) are not content.
  td.addRule('copyExcluded', {
    filter: (node) => (node as HTMLElement).getAttribute?.('data-markdown-copy') === 'exclude',
    replacement: () => '',
  });

  // The header bar is the code block's chrome (language label, Copy, Download); the language goes on the fence.
  td.addRule('codeHeader', { filter: (node) => isCodeHeader(node as HTMLElement), replacement: () => '' });

  td.addRule('codeBlock', {
    filter: (node) => node.nodeName === 'PRE' || (node as HTMLElement).getAttribute?.('data-code-block') === 'true',
    replacement: (_content, node) => {
      const block = node as HTMLElement;
      const isPre = block.nodeName === 'PRE';
      const source = block.querySelector('code') ?? block;
      const code = (source.textContent ?? '').replace(/\n$/, '');
      const f = fence(code);
      return `\n\n${f}${isPre ? codeLanguage(block) : codeBlockLanguage(block)}\n${code}\n${f}\n\n`;
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
