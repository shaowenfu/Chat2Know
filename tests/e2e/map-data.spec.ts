/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { send } from './helpers';

test('map data: JSON / Markdown / OPML exports; the JSON export round-trips; other files are refused', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const map = (await send<{ id: string }>(panel, 'map/addSubject', { title: '线性代数' })).data.id;
  const topic = (await send<{ id: string }>(panel, 'map/addSection', { parentId: map, title: '转置' })).data.id;
  await send(panel, 'map/addItem', { parentId: topic, itemType: 'formula', text: '(AB)^T = B^T A^T' });
  expect((await send(panel, 'map/import', { json: '{}' })).error).toBe('error.notExport');
  expect((await send(panel, 'map/import', { json: JSON.stringify({ format: 'chat2know', version: 1, nodes: [] }) })).error).toBe('error.exportVersion');

  const md = (await send<string>(panel, 'map/export', { format: 'markdown' })).data;
  expect(md).toBe('# 线性代数\n\n## 转置\n\n- $(AB)^T = B^T A^T$\n');
  expect((await send<string>(panel, 'map/export', { format: 'opml' })).data).toContain('<outline text="$(AB)^T = B^T A^T$"/>');

  const json = (await send<string>(panel, 'map/export', { format: 'json' })).data;
  const file = JSON.parse(json) as { format: string; version: number; nodes: unknown[] };
  expect([file.format, file.version, file.nodes.length]).toEqual(['chat2know', 2, 3]);
  // Importing the same export again replaces the same nodes.
  expect((await send(panel, 'map/import', { json })).data).toEqual({ nodes: 3 });
  expect((await send<string>(panel, 'map/export', { format: 'markdown' })).data).toBe(md);
});
