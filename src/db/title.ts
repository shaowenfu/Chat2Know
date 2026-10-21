const MAX = 80;

/** Derives a short plain-text title from captured Markdown. */
export function titleFromMarkdown(markdown: string): string {
  const line =
    markdown
      .split('\n')
      .map((l) =>
        l
          .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+|\|)/, '')
          .replace(/^`{3,}.*$|^\$\$$/, '')
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\$+([^$]*)\$+/g, '$1')
          .replace(/[*_`]+/g, '')
          .replace(/\s*\|\s*/g, ' ')
          .trim(),
      )
      .find((l) => l.length > 0) ?? '';
  return line.length > MAX ? `${line.slice(0, MAX - 1).trimEnd()}…` : line;
}
