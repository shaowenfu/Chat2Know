import katex from 'katex';

/**
 * The floating window's answer as HTML: the small part of Markdown a short answer
 * uses (paragraphs, line breaks, lists, **bold**, *italic*, `code`) and formulas
 * typeset as MathML, which the browser draws without fonts or stylesheets on the
 * page. Everything else is escaped text. An unfinished formula while streaming
 * shows as its source until it closes.
 */

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const math = (tex: string, display: boolean) => katex.renderToString(tex, { output: 'mathml', displayMode: display, throwOnError: false });

// Formulas first, so their insides are never read as Markdown: $$…$$, \[…\], $…$, \(…\).
const FORMULA = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
const LIST_ITEM = /^\s*(?:[-*]|\d+[.)])\s+/;

function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
}

/** One line of text with its formulas typeset. */
function line(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(FORMULA)) {
    out += inline(text.slice(last, m.index));
    const display = m[1] !== undefined || m[2] !== undefined;
    out += math((m[1] ?? m[2] ?? m[3] ?? m[4]!).trim(), display);
    last = m.index + m[0].length;
  }
  return out + inline(text.slice(last));
}

export function answerHtml(markdown: string): string {
  // A displayed formula may span lines and blank lines; keep it in one block.
  const blocks: string[] = [];
  for (const part of markdown.trim().split(/\n{2,}/)) {
    const prev = blocks.at(-1);
    if (prev !== undefined && (prev.match(/\$\$/g)?.length ?? 0) % 2 === 1) blocks[blocks.length - 1] = `${prev}\n\n${part}`;
    else blocks.push(part);
  }
  return blocks
    .filter((b) => b.trim())
    .map((b) => {
      const lines = b.split('\n');
      if (lines.every((l) => LIST_ITEM.test(l))) {
        const tag = /^\s*\d/.test(lines[0]!) ? 'ol' : 'ul';
        return `<${tag}>${lines.map((l) => `<li>${line(l.replace(LIST_ITEM, ''))}</li>`).join('')}</${tag}>`;
      }
      // A displayed formula's own line breaks are TeX's, not the text's.
      if (/\$\$|\\\[/.test(b)) return `<p>${line(b.replace(/^#+\s+/gm, ''))}</p>`;
      return `<p>${lines.map((l) => line(l.replace(/^#+\s+/, ''))).join('<br>')}</p>`;
    })
    .join('');
}

/** The answer as one line of plain text with its formulas as $…$, for a statement in the map. */
export function answerStatement(markdown: string): string {
  return markdown
    .replace(/\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/g, (_m, a?: string, b?: string, c?: string) => `$${(a ?? b ?? c)!.trim()}$`)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*(?:[-*]|\d+[.)]|#+)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
