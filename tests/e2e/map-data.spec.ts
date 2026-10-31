/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { send } from './helpers';

test('map data: a v0.1 export imports into 待归位; JSON / Markdown / OPML exports; the JSON export round-trips', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const v01 = {
    format: 'chat2know',
    version: 1,
    exportedAt: 0,
    nodes: [{ id: 'k1', type: 'knowledge', title: 'Why?', body: '$$(AB)^T = B^T A^T$$' }],
    edges: [],
    sources: [],
    reviews: [],
  };
  expect((await send(panel, 'map/import', { json: JSON.stringify(v01) })).data).toEqual({ nodes: 1 });
  expect((await send(panel, 'map/import', { json: '{}' })).error).toBe('error.notExport');

  const md = (await send<string>(panel, 'map/export', { format: 'markdown' })).data;
  expect(md).toBe('# Imported notes\n\n## Unplaced\n\n- $(AB)^T = B^T A^T$\n');
  expect((await send<string>(panel, 'map/export', { format: 'opml' })).data).toContain('<outline text="$(AB)^T = B^T A^T$"/>');

  const json = (await send<string>(panel, 'map/export', { format: 'json' })).data;
  const file = JSON.parse(json) as { format: string; version: number; nodes: unknown[] };
  expect([file.format, file.version, file.nodes.length]).toEqual(['chat2know', 2, 3]);
  // Importing the same export again replaces the same nodes.
  expect((await send(panel, 'map/import', { json })).data).toEqual({ nodes: 3 });
  expect((await send<string>(panel, 'map/export', { format: 'markdown' })).data).toBe(md);
});
