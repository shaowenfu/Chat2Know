/// <reference types="chrome" />
import { expect, test } from './fixtures';
import { configureModel, openPageAndPanel, send, tabIdOf } from './helpers';
import type { NodeView } from '@/src/db/types';

const EN = 'synthetic-chat-katex.html';

test('organize a whole page into candidate cards with provenance', async ({ context, extensionId, fixtureServer, mockLlm }) => {
  const url = `${fixtureServer}/${EN}`;
  const { panel } = await openPageAndPanel(context, extensionId, url);
  await configureModel(panel, mockLlm.url);
  const res = await send<{ cards: { quote: string }[]; url: string }>(panel, 'organize/page', { tabId: await tabIdOf(panel, url) });
  expect(res.ok).toBe(true);
  expect(res.data.url).toBe(url);
  expect(res.data.cards.length).toBeGreaterThan(0);
  const sent = mockLlm.requests.at(-1)!.body.messages!.at(-1)!.content;
  expect(sent).toContain('$$\n\\mathrm{Attention}'); // the page went to the model as Markdown, LaTeX intact
  for (const c of res.data.cards) expect(sent).toContain(c.quote); // quotes are verbatim
});

test('paste organize: review candidates, uncheck one, keep the rest', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  await panel.getByTestId('tab-cards').click();
  await panel.getByTestId('organize-paste').click();
  await panel.getByRole('textbox').fill(
    'Attention lets each token weigh every other token in the sequence.\n\nThe scaling factor keeps the softmax from saturating for large d.\n\nok',
  );
  await panel.getByTestId('organize-start').click();
  await expect(panel.getByTestId('organize-row')).toHaveCount(2);
  await panel.getByRole('checkbox', { name: 'Keep this card' }).nth(1).uncheck();
  await panel.getByRole('textbox', { name: 'Question to review it by' }).first().fill('What does attention let tokens do?');
  await panel.getByTestId('organize-keep').click();
  await expect(panel.getByRole('status')).toHaveText('Kept 1 card');
  const nodes = (await send<NodeView[]>(panel, 'nodes/list', {})).data;
  expect(nodes).toMatchObject([{ title: 'What does attention let tokens do?', summary: 'Attention lets each token weigh every other token in the sequence.', sources: [] }]);
});
