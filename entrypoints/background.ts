import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { i18n } from '#i18n';
import { onMessages, sendTabMessage, type Envelope } from '@/src/messaging';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository, type CaptureType } from '@/src/db/repository';
import { nodesToMarkdown } from '@/src/export/markdown';
import { textFragmentUrl } from '@/src/capture/text-fragment';

const CONTENT_SCRIPT = '/content-scripts/content.js';

async function deviceId(): Promise<string> {
  const { deviceId } = await browser.storage.local.get('deviceId');
  if (typeof deviceId === 'string') return deviceId;
  const id = crypto.randomUUID().slice(0, 8);
  await browser.storage.local.set({ deviceId: id });
  return id;
}

let repoPromise: Promise<Repository> | undefined;
function repo(): Promise<Repository> {
  repoPromise ??= deviceId().then((id) => new Repository(new Chat2KnowDB(), new Hlc(id)));
  return repoPromise;
}

async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId !== undefined) return tabId;
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab');
  return tab.id;
}

/** Injects the content script; it guards against running twice. */
async function inject(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
}

function notifyNodesChanged(): void {
  const event: Envelope<'event/nodesChanged'> = { type: 'event/nodesChanged', payload: {} };
  // Rejects when no side panel is open; that is fine.
  browser.runtime.sendMessage(event).catch(() => {});
}

async function save(type: CaptureType, capture: Parameters<Repository['capture']>[1]): Promise<{ nodeId: string }> {
  const node = await (await repo()).capture(type, capture);
  notifyNodesChanged();
  return { nodeId: node.id };
}

async function captureFromTab(type: CaptureType, tabId?: number): Promise<{ nodeId: string }> {
  const id = await resolveTabId(tabId);
  await inject(id);
  const capture = await sendTabMessage(id, 'content/capture', {});
  if (!capture) throw new Error('No text selected');
  return save(type, capture);
}

function waitForComplete(tabId: number, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    browser.tabs.onUpdated.addListener(listener);
    void browser.tabs.get(tabId).then((t) => t.status === 'complete' && done(), done);
  });
}

async function openSource(sourceId: string): Promise<{ tabId: number; highlighted: boolean }> {
  const source = await (await repo()).getSource(sourceId);
  if (!source) throw new Error('Source not found');
  const quote = { exact: source.quoteExact, prefix: source.quotePrefix, suffix: source.quoteSuffix };
  // The Text Fragment scrolls and highlights natively; our own highlight is a
  // more precise best effort that only works where we may inject.
  const tab = await browser.tabs.create({ url: textFragmentUrl(source.url, quote), active: true });
  const tabId = tab.id!;
  await waitForComplete(tabId);
  try {
    await inject(tabId);
    const { found } = await sendTabMessage(tabId, 'content/highlight', { quote });
    return { tabId, highlighted: found };
  } catch {
    return { tabId, highlighted: false };
  }
}

const MENU_KNOWLEDGE = 'chat2know-save-knowledge';
const MENU_IDEA = 'chat2know-save-idea';

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU_KNOWLEDGE, title: i18n.t('menu.saveKnowledge'), contexts: ['selection'] });
      browser.contextMenus.create({ id: MENU_IDEA, title: i18n.t('menu.saveIdea'), contexts: ['selection'] });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const type: CaptureType | undefined =
      info.menuItemId === MENU_KNOWLEDGE ? 'knowledge' : info.menuItemId === MENU_IDEA ? 'idea' : undefined;
    if (type && tab?.id !== undefined) captureFromTab(type, tab.id).catch(() => {});
  });

  browser.commands.onCommand.addListener((command, tab) => {
    const type: CaptureType | undefined =
      command === 'capture-knowledge' ? 'knowledge' : command === 'capture-idea' ? 'idea' : undefined;
    if (type) captureFromTab(type, tab?.id).catch(() => {});
  });

  onMessages({
    ping: ({ from }) => ({ from: 'background', echo: from, at: Date.now() }),
    'page/activate': async ({ tabId }) => {
      const id = await resolveTabId(tabId);
      await inject(id);
      return { tabId: id };
    },
    'capture/save': ({ type, capture }) => save(type, capture),
    'capture/fromTab': ({ type, tabId }) => captureFromTab(type, tabId),
    'nodes/list': async () => (await repo()).listNodes(),
    'nodes/delete': async ({ id }) => {
      await (await repo()).deleteNode(id);
      notifyNodesChanged();
      return null;
    },
    'source/open': ({ sourceId }) => openSource(sourceId),
    'data/exportJson': async () => JSON.stringify(await (await repo()).exportData(), null, 2),
    'data/exportMarkdown': async () => nodesToMarkdown(await (await repo()).listNodes(), new Date()),
    'data/importJson': async ({ json }) => {
      const result = await (await repo()).importData(json);
      notifyNodesChanged();
      return result;
    },
  });
});
