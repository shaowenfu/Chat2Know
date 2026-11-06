/// <reference types="chrome" />
import { mkdirSync } from 'node:fs';
import { generateNKeysBetween } from 'fractional-indexing';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { configureModel, send } from './helpers';

const SHOTS = 'tests/e2e/screenshots';

/** A small linear algebra map: chapters, topics, items, a grey outline topic, and two items waiting in 待归位. */
function seedMap() {
  const keys = generateNKeysBetween(null, null, 40);
  let order = 0;
  const node = (id: string, kind: string, parentId: string | undefined, title: string, extra: Record<string, unknown> = {}) => ({
    id,
    subjectId: 's',
    kind,
    ...(parentId ? { parentId } : {}),
    order: keys[order++]!,
    title,
    origin: 'user',
    createdAt: Date.UTC(2026, 9, 26),
    updatedAt: '0',
    ...extra,
  });
  const source = { url: 'https://chatgpt.com/c/demo', pageTitle: 'Chat', quoteExact: '(AB)T=BTAT', quotePrefix: '', quoteSuffix: '', capturedAt: Date.UTC(2026, 9, 30) };
  const f = (id: string, parentId: string, latex: string, extra: Record<string, unknown> = {}) => node(id, 'item', parentId, '', { itemType: 'formula', latex, ...extra });
  return [
    node('s', 'subject', undefined, '线性代数'),
    node('u', 'section', 's', '', { role: 'unplaced' }),
    f('u1', 'u', '\\mathrm{tr}(AB) = \\mathrm{tr}(BA)'),
    node('u2', 'item', 'u', '正交矩阵的逆等于它的转置', { itemType: 'statement' }),
    node('v', 'section', 's', '向量与向量空间'),
    f('v1', 'v', '\\langle x, y \\rangle = x^T y'),
    node('m', 'section', 's', '矩阵'),
    node('mm', 'section', 'm', '矩阵乘法'),
    f('mm1', 'mm', '(AB)C = A(BC)'),
    node('mt', 'section', 'm', '转置'),
    f('mt1', 'mt', '(AB)^T = B^T A^T', { source }),
    f('mt2', 'mt', '(A + B)^T = A^T + B^T'),
    node('mi', 'section', 'm', '逆矩阵'),
    f('mi1', 'mi', '(AB)^{-1} = B^{-1}A^{-1}'),
    node('mr', 'section', 'm', '秩', { origin: 'outline' }),
    node('d', 'section', 's', '行列式'),
    f('d1', 'd', '\\det(AB) = \\det A \\det B'),
    node('l', 'section', 's', '线性方程组', { origin: 'outline' }),
    node('e', 'section', 's', '特征值与特征向量'),
    f('e1', 'e', 'Av = \\lambda v'),
  ];
}

/** The seed map, imported and opened (as the user would open it). */
async function importSeed(panel: Page) {
  await send(panel, 'map/import', { json: JSON.stringify({ format: 'chat2know', version: 2, exportedAt: 0, nodes: seedMap() }) });
  await send(panel, 'maps/open', { id: 's' });
}
const markdown = async (panel: Page) => (await send<string>(panel, 'map/export', { format: 'markdown', includeGrey: true })).data;

test('side panel: empty state, the map without a model, folding, drag, edit, delete with undo, move to', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 380, height: 820 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByTestId('empty')).toContainText('Your knowledge map grows here');
  await expect(panel.getByTestId('site-chatgpt')).not.toBeChecked();

  await importSeed(panel);
  await expect(panel.getByTestId('no-model')).toBeVisible();
  const tree = panel.getByRole('tree');
  await expect(tree).toContainText('9 items');
  // 待归位 is open; chapters are folded.
  await expect(panel.getByTestId('map-item')).toHaveCount(2);
  await tree.getByRole('button', { name: '矩阵', exact: true }).click();
  await expect(tree.getByRole('button', { name: '转置', exact: true })).toBeVisible();
  await expect(tree.locator('[data-testid="map-section"]', { hasText: '秩' })).toContainText('not yet');

  // Drag an unplaced item onto a topic.
  await panel.getByTestId('map-item').filter({ hasText: '正交矩阵' }).dragTo(tree.getByRole('button', { name: '逆矩阵', exact: true }));
  await expect.poll(() => markdown(panel)).toContain('### 逆矩阵\n\n- $(AB)^{-1} = B^{-1}A^{-1}$\n- 正交矩阵的逆等于它的转置');

  // Edit through the context menu.
  await tree.getByRole('button', { name: '转置', exact: true }).click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Edit' }).click();
  await panel.keyboard.press('Control+a');
  await panel.keyboard.type('转置与对称');
  await panel.keyboard.press('Enter');
  await expect(tree.getByRole('button', { name: '转置与对称', exact: true })).toBeVisible();

  // Delete: the topic's items move up into 矩阵; Undo brings it back.
  await tree.getByRole('button', { name: '转置与对称', exact: true }).click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(panel.locator('.foot')).toContainText('Deleted "转置与对称"');
  expect(await markdown(panel)).not.toContain('转置与对称');
  await panel.locator('.foot').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => markdown(panel)).toContain('### 转置与对称');
  // Ctrl+Z undoes the latest change: the rename.
  await panel.locator('.map').click({ position: { x: 300, y: 5 } });
  await panel.keyboard.press('Control+z');
  await expect.poll(() => markdown(panel)).toContain('### 转置\n');

  // Move to… with search.
  await panel.getByTestId('map-item').filter({ hasText: 'tr' }).first().click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Move to…' }).click();
  await panel.getByPlaceholder('Type a topic name').fill('行列');
  await panel.getByRole('menuitem', { name: '线性代数 › 行列式' }).click();
  await expect.poll(() => markdown(panel)).toContain('## 行列式\n\n- $\\det(AB) = \\det A \\det B$\n- $\\mathrm{tr}(AB) = \\mathrm{tr}(BA)$');
});

test('editing the map: ↗ jumps back, a click only selects, double-click edits, add items and sections, keys', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await importSeed(panel);
  const tree = panel.getByRole('tree');
  await tree.getByRole('button', { name: '矩阵', exact: true }).click();
  await tree.getByRole('button', { name: '转置', exact: true }).click();

  // A click on an item selects it; only ↗ goes back to the conversation.
  const sourced = panel.getByTestId('map-item').filter({ hasText: 'B^T A^T' }).first();
  const pages = context.pages().length;
  await sourced.locator('.item-body').click();
  await panel.waitForTimeout(300);
  expect(context.pages()).toHaveLength(pages);
  await expect(sourced).toHaveClass(/selected/);
  const opened = context.waitForEvent('page');
  await sourced.getByTestId('jump').click();
  expect((await opened).url()).toContain('chatgpt.com/c/demo');
  await panel.bringToFront();

  // Double-click edits.
  await panel.getByTestId('map-item').filter({ hasText: '(A + B)' }).locator('.item-body').dblclick();
  await panel.keyboard.press('End');
  await panel.keyboard.type(' \\quad');
  await panel.keyboard.press('Enter');
  await expect.poll(() => markdown(panel)).toContain('(A + B)^T = A^T + B^T \\quad');

  // Right-click a topic: add a statement in place.
  await tree.getByRole('button', { name: '逆矩阵', exact: true }).click({ button: 'right' });
  await panel.getByRole('menuitem', { name: 'Add a statement' }).click();
  await panel.getByTestId('add-item').fill('可逆矩阵的行列式不为零');
  await panel.getByTestId('add-item').press('Enter');
  await expect.poll(() => markdown(panel)).toContain('### 逆矩阵\n\n- $(AB)^{-1} = B^{-1}A^{-1}$\n- 可逆矩阵的行列式不为零');

  // Keys on the selected node: Enter adds a sibling right after it, Tab nests it under the one before.
  await tree.getByRole('button', { name: '逆矩阵', exact: true }).click();
  await panel.keyboard.press('Enter');
  await expect(panel.locator('input.edit')).toBeFocused();
  await panel.keyboard.press('Control+a');
  await panel.keyboard.type('伴随矩阵');
  await panel.keyboard.press('Enter');
  await expect.poll(() => markdown(panel)).toMatch(/### 逆矩阵[\s\S]*### 伴随矩阵[\s\S]*### 秩/);
  await tree.getByRole('button', { name: '伴随矩阵', exact: true }).click();
  await panel.keyboard.press('Tab');
  await expect.poll(() => markdown(panel)).toContain('#### 伴随矩阵');
  // The panel shows the new nesting (one branch deeper) before the next key.
  const depth = () =>
    panel.evaluate(() => {
      const row = [...document.querySelectorAll('[data-testid=map-section]')].find((r) => r.textContent?.includes('伴随矩阵'));
      let n = 0;
      for (let e = row?.parentElement; e; e = e.parentElement) if (e.classList.contains('branch')) n++;
      return n;
    });
  await expect.poll(depth).toBe(3);
  await panel.keyboard.press('Shift+Tab');
  await expect.poll(() => markdown(panel)).toMatch(/\n### 伴随矩阵/);
  await expect.poll(depth).toBe(2);
  await panel.keyboard.press('Delete');
  await expect(panel.locator('.foot')).toContainText('Deleted "伴随矩阵"');
  expect(await markdown(panel)).not.toContain('伴随矩阵');
});

test('full page: tabs, outline toggle, detail pane with sources, adding an item; settings saves and tests the model', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await importSeed(panel);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/map.html`);
  await expect(page.getByTestId('subject-tab')).toHaveText(['线性代数']);
  const map = page.getByTestId('full-map');
  await map.getByRole('button', { name: '转置', exact: true }).click();
  const detail = page.getByTestId('detail');
  await expect(detail.locator('h2')).toHaveText('转置');
  await expect(detail.locator('.entry')).toHaveCount(2);
  await expect(detail.getByRole('button', { name: /From the conversation/ })).toHaveCount(1);
  await detail.getByPlaceholder(/LaTeX/).fill('(A^T)^T = A');
  await detail.getByRole('button', { name: 'Add' }).click();
  await expect(detail.locator('.entry')).toHaveCount(3);

  await expect(map.getByRole('button', { name: '线性方程组', exact: true })).toBeVisible();
  await page.getByTestId('show-grey').uncheck();
  await expect(map.getByRole('button', { name: '线性方程组', exact: true })).toHaveCount(0);

  await page.goto(`chrome-extension://${extensionId}/map.html#settings`);
  await page.getByTestId('base-url').fill(mockLlm.url);
  await page.getByTestId('model').fill('mock-model');
  await page.getByTestId('api-key').fill('test-key');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('model-status')).toHaveText('Saved.');
  await expect(page.getByTestId('api-key')).toHaveValue('');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByTestId('model-settings')).toContainText('● Connected');
  await page.getByTestId('record-asks').check();
  expect((await send<{ recordAsks: boolean }>(panel, 'sites/get', {})).data.recordAsks).toBe(true);
  // Saving the model placed the two items waiting in 待归位.
  await expect.poll(() => markdown(panel)).not.toContain('## Unplaced');

  // The language follows the user's pick: open pages reload in it, prompts too.
  await page.getByTestId('ui-lang').selectOption('zh_CN');
  await expect(page.getByRole('link', { name: '导图' })).toBeVisible();
  await expect(panel.getByRole('tree')).toContainText('条');
  await page.getByTestId('ui-lang').selectOption('auto');
  await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('button', { name: 'Click again to delete everything' }).click();
  await expect(page.getByTestId('data-status')).toHaveText('All data deleted.');
  expect(await markdown(panel)).toBe('\n');
});

test('outline: offered once per subject with a preview; laid as grey sections, or from a pasted table of contents', async ({ context, extensionId, mockLlm }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configureModel(panel, mockLlm.url);
  const subject = (await send<{ id: string }>(panel, 'map/addSubject', { title: '线性代数' })).data.id;
  const topic = (await send<{ id: string }>(panel, 'map/addSection', { parentId: subject, title: '转置' })).data.id;
  // No offer before the first note.
  expect((await send<{ offer: boolean }>(panel, 'outline/state', { subjectId: subject })).data.offer).toBe(false);
  await send(panel, 'map/addItem', { parentId: topic, itemType: 'formula', text: '(AB)^T = B^T A^T' });

  const offer = panel.getByTestId('outline-offer');
  await expect(offer).toContainText('This is your first note in "线性代数"');
  await expect(offer.locator('li.known')).toHaveText(['转置1']);
  await offer.getByRole('button', { name: 'From my textbook' }).click();
  await offer.getByTestId('toc').fill('1 矩阵\n  1.1 转置\n  1.2 逆矩阵\n2 行列式');
  await offer.getByRole('button', { name: 'Use this table of contents' }).click();
  await expect(offer.locator('li')).toHaveText(['矩阵', '转置1', '逆矩阵', '行列式']);
  await offer.getByRole('button', { name: 'Lay it out' }).click();

  await expect(offer).toHaveCount(0);
  await expect(panel.getByRole('tree')).toContainText('行列式not yet');
  expect(await markdown(panel)).toBe('# 线性代数\n\n## 矩阵\n\n### 转置\n\n- $(AB)^T = B^T A^T$\n\n### 逆矩阵\n\n## 行列式\n');
  // Asked once: laid, it is not offered again.
  expect((await send<{ offer: boolean }>(panel, 'outline/state', { subjectId: subject })).data.offer).toBe(false);
});

test.describe('screenshots in Chinese, compared with the artboards', () => {
  test.use({ uiLang: 'zh-CN' });

  test('artboards 9, 7, 11, 5, 1, 2, 3', async ({ context, extensionId, fixtureServer, mockLlm }) => {
    mkdirSync(SHOTS, { recursive: true });
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 380, height: 820 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(panel.getByTestId('empty')).toContainText('你的知识导图会长在这里');
    await panel.setViewportSize({ width: 380, height: 1000 });
    await panel.screenshot({ path: `${SHOTS}/9-first-screen.png` });
    await panel.setViewportSize({ width: 380, height: 820 });

    await importSeed(panel);
    await expect(panel.getByTestId('no-model')).toContainText('还没配置模型');
    await panel.getByRole('tree').getByRole('button', { name: '矩阵', exact: true }).click();
    await panel.screenshot({ path: `${SHOTS}/7-no-model.png` });

    // The user creates a second map from the switcher (artboard 11); it opens.
    await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });
    await configureModel(panel, mockLlm.url);
    await expect.poll(() => markdown(panel)).not.toContain('待归位');
    await panel.getByTestId('map-switcher').click();
    await panel.getByTestId('new-map-title').fill('深度学习');
    await panel.screenshot({ path: `${SHOTS}/11-map-switcher.png` });
    await panel.getByRole('button', { name: '＋ 新建' }).click();
    await expect(panel.getByTestId('map-switcher')).toHaveText('深度学习');

    // Record a formula on a page: it goes into the open map, marked 刚记下.
    const page = await context.newPage();
    await page.goto(`${fixtureServer}/synthetic-chat-katex.html`);
    await page.locator('chat2know-ui button[data-state="add"]').click();
    await expect(page.locator('chat2know-ui .toast')).toContainText('已记到 深度学习 › 注意力机制');
    await panel.bringToFront();
    // A new subject with its first note: the outline offer, once.
    const offer = panel.getByTestId('outline-offer');
    await expect(offer).toContainText('这是你在「深度学习」下记的第一条');
    await expect(offer).toContainText('正则化');
    await panel.screenshot({ path: `${SHOTS}/5-outline-offer.png` });
    await offer.getByRole('button', { name: '不用' }).click();
    await expect(panel.getByRole('tree')).toContainText('刚记下');
    await panel.screenshot({ path: `${SHOTS}/1-sidepanel.png` });

    const full = await context.newPage();
    await full.setViewportSize({ width: 1280, height: 800 });
    await full.goto(`chrome-extension://${extensionId}/map.html`);
    await full.getByTestId('subject-tab').filter({ hasText: '线性代数' }).click();
    await full.getByTestId('full-map').getByRole('button', { name: '转置', exact: true }).click();
    await expect(full.getByTestId('detail').locator('h2')).toHaveText('转置');
    await full.screenshot({ path: `${SHOTS}/2-full-map.png` });

    await full.goto(`chrome-extension://${extensionId}/map.html#settings`);
    await expect(full.getByTestId('base-url')).toHaveValue(mockLlm.url);
    await full.screenshot({ path: `${SHOTS}/3-settings.png` });
  });

  test('stuck: every 5 questions in the open map the model looks; a gentle card in the side panel, the topic orange, 不用 for today (artboard 15)', async ({ context, extensionId, fixtureServer, mockLlm }) => {
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 380, height: 820 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await importSeed(panel); // opens 线性代数
    await configureModel(panel, mockLlm.url);
    await send(panel, 'sites/setOrigins', { origins: [fixtureServer] });

    const chat = await context.newPage();
    const sendQuestions = async (questions: [string, string][]) => {
      for (const [conversation, question] of questions) {
        if (!chat.url().endsWith(`c=${conversation}`)) {
          await chat.goto(`${fixtureServer}/synthetic-chat-input.html?c=${conversation}`);
          await chat.locator('chat2know-ui').waitFor({ state: 'attached' });
          await chat.waitForTimeout(300); // the question listener attaches once the settings are read
        }
        await chat.locator('#prompt').fill(question);
        await chat.locator('#prompt').press('Enter');
        await chat.locator('#prompt').fill('');
        await chat.waitForTimeout(150); // the recorder reports once the box is empty
      }
    };
    const card = panel.getByTestId('stuck-card');
    // Four questions: not looked at yet.
    await sendQuestions([
      ['1', '为什么转置之后乘积的顺序要反过来？'],
      ['1', '转置和逆的顺序规则是一样的吗？'],
      ['2', '矩阵转置到底改变了什么？'],
      ['2', '迹有什么用？'],
    ]);
    await expect.poll(async () => (await send<unknown[]>(panel, 'asks/list', {})).data.length).toBe(4);
    await expect(card).toHaveCount(0);
    // The fifth: the model reads the five, in order and by conversation, and sees circling on 转置.
    await sendQuestions([['2', '还是不懂转置的顺序']]);
    await expect(card).toContainText('好像在「转置」这里绕了几圈');
    await expect(card).toContainText('最近 4 个问题都在问「转置」');
    await expect(panel.getByTestId('better-question')).toHaveText('用一个具体的例子，一步步讲清楚「转置」是怎么算的。');
    await expect(panel.locator('.row.stuck')).toHaveText(/转置/);
    await expect(panel.locator('.foot')).toContainText('每 5 个新问题看一次');
    const asks = (await send<{ mapId?: string; via: string }[]>(panel, 'asks/list', {})).data;
    expect(asks.map((a) => [a.mapId, a.via])).toEqual(Array(5).fill(['s', 'site']));
    const asked = mockLlm.requests.filter((r) => r.body.messages?.[0]?.content.startsWith('[task:stuck]'));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.body.messages![1]!.content).toContain('对话 1\n[1] 为什么转置之后乘积的顺序要反过来？\n[2] 转置和逆的顺序规则是一样的吗？\n对话 2\n[3] 矩阵转置到底改变了什么？');
    await panel.screenshot({ path: `${SHOTS}/15-stuck.png` });

    await card.getByRole('button', { name: '看看我问过的' }).click();
    await expect(panel.getByTestId('stuck-asks').locator('li')).toHaveCount(4);
    await panel.bringToFront(); // the clipboard takes writes from the focused page
    await card.getByRole('button', { name: '复制这个问题' }).click();
    await expect(card.getByRole('button', { name: '已复制' })).toBeVisible();

    // 不用: the card and the orange go; five more questions are looked at, but this map stays quiet today.
    await card.getByRole('button', { name: '不用' }).click();
    await expect(card).toHaveCount(0);
    await expect(panel.locator('.row.stuck')).toHaveCount(0);
    await sendQuestions([1, 2, 3, 4, 5].map((i) => ['3', `转置的顺序 ${i}`] as [string, string]));
    await expect.poll(() => mockLlm.requests.filter((r) => r.body.messages?.[0]?.content.startsWith('[task:stuck]')).length).toBe(2);
    await panel.reload();
    await expect(panel.getByRole('tree')).toBeVisible();
    await expect(card).toHaveCount(0);
  });
});
