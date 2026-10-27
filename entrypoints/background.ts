import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { i18n } from '#i18n';
import { onMessages, sendTabMessage, type Envelope } from '@/src/messaging';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository, type CaptureType } from '@/src/db/repository';
import { nodesToMarkdown } from '@/src/export/markdown';
import { textFragmentUrl } from '@/src/capture/text-fragment';
import { LlmClient } from '@/src/llm/client';
import { isConfigured, loadSettings, saveSettings, toPublic } from '@/src/llm/settings';
import { answerQuestion, confirmKeep, dismissQuestion, suggestKeep } from '@/src/services/ask';
import { Distiller } from '@/src/services/distill';
import { judge, selfGrade } from '@/src/services/quiz';

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

/** A client for an explicit user action: throws "Model is not configured" when settings are missing. */
async function client(): Promise<LlmClient> {
  return new LlmClient(await loadSettings());
}

let distillerPromise: Promise<Distiller> | undefined;
function distiller(): Promise<Distiller> {
  distillerPromise ??= repo().then(
    (r) =>
      new Distiller(
        r,
        async () => {
          const s = await loadSettings();
          return isConfigured(s) ? new LlmClient(s) : null;
        },
        notifyChanged,
      ),
  );
  return distillerPromise;
}

const defaultQuestion = (term: string) => i18n.t('ask.chipWhat', [term]);

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

function notifyChanged(): void {
  const event: Envelope<'event/dataChanged'> = { type: 'event/dataChanged', payload: {} };
  // Rejects when no side panel is open; that is fine.
  browser.runtime.sendMessage(event).catch(() => {});
}

async function save(type: CaptureType, capture: Parameters<Repository['capture']>[1]): Promise<{ nodeId: string }> {
  const node = await (await repo()).capture(type, capture);
  notifyChanged();
  if (type === 'knowledge') void distiller().then((d) => d.distill(node.id));
  return { nodeId: node.id };
}

async function captureFromTab(type: CaptureType, tabId?: number): Promise<{ nodeId: string }> {
  const id = await resolveTabId(tabId);
  await inject(id);
  const capture = await sendTabMessage(id, 'content/capture', {});
  if (!capture) throw new Error('No text selected');
  return save(type, capture);
}

async function askFromTab(tabId?: number): Promise<null> {
  const id = await resolveTabId(tabId);
  await inject(id);
  return sendTabMessage(id, 'content/askLater', {});
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
const MENU_ASK = 'chat2know-ask-later';

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // Cards captured while the worker was asleep or the model was unreachable.
  void distiller().then((d) => d.drain());

  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU_KNOWLEDGE, title: i18n.t('menu.saveKnowledge'), contexts: ['selection'] });
      browser.contextMenus.create({ id: MENU_IDEA, title: i18n.t('menu.saveIdea'), contexts: ['selection'] });
      browser.contextMenus.create({ id: MENU_ASK, title: i18n.t('menu.askLater'), contexts: ['selection'] });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ASK && tab?.id !== undefined) {
      askFromTab(tab.id).catch(() => {});
      return;
    }
    const type: CaptureType | undefined =
      info.menuItemId === MENU_KNOWLEDGE ? 'knowledge' : info.menuItemId === MENU_IDEA ? 'idea' : undefined;
    if (type && tab?.id !== undefined) captureFromTab(type, tab.id).catch(() => {});
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'ask-later') {
      askFromTab(tab?.id).catch(() => {});
      return;
    }
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
    'ask/save': async (input) => {
      const res = await (await repo()).askLater(input);
      notifyChanged();
      return res;
    },
    'ask/update': async ({ id, question }) => {
      await (await repo()).updateQuestion(id, question);
      notifyChanged();
      return null;
    },
    'ask/fromTab': ({ tabId }) => askFromTab(tabId),
    'ask/forUrl': async ({ url }) => (await repo()).questionsForUrl(url),
    'ask/answer': async ({ questionId }) => {
      const item = await answerQuestion(await repo(), await client(), questionId, defaultQuestion);
      notifyChanged();
      return item;
    },
    'ask/dismiss': async ({ questionId, suggestion }) => {
      await dismissQuestion(await repo(), questionId, suggestion);
      notifyChanged();
      return null;
    },
    'inbox/list': async () => (await repo()).listInbox(),
    'keep/suggest': async ({ inboxId }) => suggestKeep(await repo(), await client(), inboxId),
    'keep/confirm': async ({ inboxId, suggestion, decision }) => {
      await confirmKeep(await repo(), inboxId, suggestion, decision);
      notifyChanged();
      return null;
    },
    'nodes/confirmTitle': async ({ id, title }) => {
      await (await repo()).confirmTitle(id, title);
      notifyChanged();
      return null;
    },
    'nodes/retryDistill': async ({ id }) => {
      await (await distiller()).retry(id);
      return null;
    },
    'nodes/move': async ({ id, parentId, beforeId }) => {
      await (await repo()).moveNode(id, parentId, beforeId);
      notifyChanged();
      return null;
    },
    'nodes/setMastery': async ({ id, mastery }) => {
      await (await repo()).setMastery(id, mastery ?? undefined);
      notifyChanged();
      return null;
    },
    'quiz/due': async () => (await repo()).dueForQuiz(),
    'quiz/grade': async ({ nodeId, answer, verdict }) => {
      const review = await selfGrade(await repo(), nodeId, answer, verdict);
      notifyChanged();
      return review;
    },
    'quiz/judge': async ({ nodeId, answer }) => {
      const review = await judge(await repo(), await client(), nodeId, answer);
      notifyChanged();
      return review;
    },
    'stats/get': async () => (await repo()).stats(),
    'settings/get': async () => toPublic(await loadSettings()),
    'settings/save': async ({ baseUrl, model, embeddingModel, apiKey }) => {
      const current = await loadSettings();
      const url = new URL(baseUrl.trim()); // throws on an invalid URL
      if (!/^https?:$/.test(url.protocol)) throw new Error('Base URL must start with http:// or https://');
      const next = {
        baseUrl: url.href.replace(/\/+$/, ''),
        model: model.trim(),
        embeddingModel: embeddingModel.trim(),
        apiKey: apiKey?.trim() || current.apiKey,
      };
      await saveSettings(next);
      notifyChanged();
      void distiller().then((d) => d.drain());
      return toPublic(next);
    },
    'settings/test': async () => ({ reply: await (await client()).chat([{ role: 'user', content: 'Reply with the single word OK.' }]) }),
    'nodes/list': async () => (await repo()).listNodes(),
    'nodes/delete': async ({ id }) => {
      await (await repo()).deleteNode(id);
      notifyChanged();
      return null;
    },
    'source/open': ({ sourceId }) => openSource(sourceId),
    'data/exportJson': async () => JSON.stringify(await (await repo()).exportData(), null, 2),
    'data/exportMarkdown': async () => nodesToMarkdown(await (await repo()).listNodes(), new Date()),
    'data/importJson': async ({ json }) => {
      const result = await (await repo()).importData(json);
      notifyChanged();
      return result;
    },
  });
});
