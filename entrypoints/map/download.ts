/** Saves text as a file through the browser's download. */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 10);

/** The map's export formats, as the export menu and the settings page offer them. */
export const EXPORT_FORMATS = [
  { format: 'json', ext: 'json', type: 'application/json', label: 'settings.exportJson' },
  { format: 'markdown', ext: 'md', type: 'text/markdown', label: 'settings.exportMarkdown' },
  { format: 'opml', ext: 'opml', type: 'text/x-opml', label: 'settings.exportOpml' },
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
