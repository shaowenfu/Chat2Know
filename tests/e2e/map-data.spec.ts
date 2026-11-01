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

test('导入旧版数据 reads the v0.1 database left in this browser; importing again adds nothing', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // What v0.1 left behind: its IndexedDB, with a formula card, a statement card and an idea.
  await panel.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chat2know', 40);
        open.onupgradeneeded = () => {
          const db = open.result;
          const nodes = db.createObjectStore('nodes', { keyPath: 'id' });
          const sources = db.createObjectStore('sources', { keyPath: 'id' });
          nodes.add({ id: 'k1', type: 'knowledge', title: 'Why?', body: '$$\n(AB)^T = B^T A^T\n$$' });
          nodes.add({ id: 'k2', type: 'knowledge', title: 'When?', body: 'long', summary: 'A is invertible iff det A ≠ 0.' });
          nodes.add({ id: 'i1', type: 'idea', title: 'idea', body: 'skip' });
          sources.add({ id: 's1', nodeId: 'k1', url: 'https://chatgpt.com/c/1', pageTitle: 'Chat', quoteExact: 'x', quotePrefix: '', quoteSuffix: '', capturedAt: 1 });
        };
        open.onsuccess = () => (open.result.close(), resolve());
        open.onerror = () => reject(open.error);
      }),
  );
  await panel.reload();
  await panel.getByRole('button', { name: 'Import v0.1 data' }).click();
  await expect(panel.getByRole('tree')).toContainText('2 items');
  const md = (await send<string>(panel, 'map/export', { format: 'markdown' })).data;
  expect(md).toBe('# Imported notes\n\n## Unplaced\n\n- $(AB)^T = B^T A^T$ ([source](https://chatgpt.com/c/1))\n- A is invertible iff det A ≠ 0.\n');
  expect((await send(panel, 'map/importV01', {})).data).toEqual({ found: true, nodes: 0 });
});
