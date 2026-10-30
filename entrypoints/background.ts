import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { i18n } from '#i18n';
import { onMessages, sendTabMessage, type Envelope } from '@/src/messaging';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository, type CaptureType } from '@/src/db/repository';
import { nodesToMarkdown } from '@/src/export/markdown';
import { nodesToOpml } from '@/src/export/opml';
import { nodesToAnki } from '@/src/export/anki';
import { textFragmentUrl } from '@/src/capture/text-fragment';
import { LlmClient } from '@/src/llm/client';
import { UserError } from '@/src/errors';
import { isConfigured, loadSettings, saveSettings, toPublic } from '@/src/llm/settings';
import { answerQuestion, confirmKeep, dismissQuestion, suggestKeep } from '@/src/services/ask';
import { Distiller } from '@/src/services/distill';
import { judge, problemFor, selfGrade } from '@/src/services/quiz';
import { suggestPlacement } from '@/src/services/placement';
import { organize } from '@/src/services/organize';
import { checkExplanation, oneMinuteScript } from '@/src/services/explain';
import { isRecording, loadRecording, saveRecording, shouldRecord, type RecordingSettings } from '@/src/recording/settings';
import { siteFor } from '@/src/capture/sites';

const CONTENT_SCRIPT = '/content-scripts/content.js';
const RECORDER_SCRIPT = '/content-scripts/recorder.js';
const RECORDER_ID = 'chat2know-recorder';

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
  if (!capture) throw new UserError('error.noSelection');
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

const matchesOf = (origins: string[]) => origins.map((o) => `${o}/*`);

/** Runs the recorder on exactly the ticked origins; the "REC" badge shows while it records. */
async function registerRecorder(s: RecordingSettings): Promise<void> {
  if ((await browser.scripting.getRegisteredContentScripts({ ids: [RECORDER_ID] })).length) {
    await browser.scripting.unregisterContentScripts({ ids: [RECORDER_ID] });
  }
  if (s.origins.length) {
    await browser.scripting.registerContentScripts([
      { id: RECORDER_ID, matches: matchesOf(s.origins), js: [RECORDER_SCRIPT], runAt: 'document_idle' },
    ]);
  }
  await showRecordingBadge(s);
}

async function showRecordingBadge(s: RecordingSettings): Promise<void> {
  await browser.action.setBadgeText({ text: isRecording(s) ? 'REC' : '' });
  await browser.action.setBadgeBackgroundColor({ color: '#b3261e' });
}

async function setRecordingOrigins(origins: string[]): Promise<RecordingSettings> {
  const previous = await loadRecording();
  const next = { ...previous, origins: [...new Set(origins.map((o) => new URL(o).origin))] };
  await saveRecording(next);
  await registerRecorder(next);
  // Open tabs get the recorder now; one that cannot be scripted (discarded, an error page) gets it on its next load.
  const added = next.origins.filter((o) => !previous.origins.includes(o));
  if (added.length) {
    const tabs = await browser.tabs.query({ url: matchesOf(added) });
    await Promise.allSettled(tabs.map((t) => browser.scripting.executeScript({ target: { tabId: t.id! }, files: [RECORDER_SCRIPT] })));
  }
  return next;
}

const MENU_KNOWLEDGE = 'chat2know-save-knowledge';
const MENU_IDEA = 'chat2know-save-idea';
const MENU_ASK = 'chat2know-ask-later';

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // Cards captured while the worker was asleep or the model was unreachable.
  void distiller().then((d) => d.drain());

  // Registered scripts survive restarts; re-registering on install / update keeps them in step with the settings.
  browser.runtime.onStartup.addListener(() => void loadRecording().then(showRecordingBadge));

  browser.runtime.onInstalled.addListener(() => {
    void loadRecording().then(registerRecorder);
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
    'ask/now': async (input) => {
      const r = await repo();
      // Asked now, the question is answered as asked, so it is never merged into an older one.
      const { nodeId } = await r.askLater(input, { merge: false });
      notifyChanged();
      const item = await answerQuestion(r, await client(), nodeId, defaultQuestion);
      notifyChanged();
      return item;
    },
    'ask/followUp': async ({ parentId, question }) => {
      const r = await repo();
      const node = await r.askFollowUp(parentId, question);
      notifyChanged();
      const item = await answerQuestion(r, await client(), node.id, defaultQuestion);
      notifyChanged();
      return item;
    },
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
      const node = await confirmKeep(await repo(), inboxId, suggestion, decision);
      notifyChanged();
      return { nodeId: node.id };
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
    'place/suggest': async ({ nodeId }) => {
      const settings = await loadSettings();
      if (!settings.embeddingModel) return null; // placement help is off until an embedding model is set
      return suggestPlacement(await repo(), new LlmClient(settings), settings.embeddingModel, nodeId);
    },
    'nodes/merge': async ({ duplicateId, targetId }) => {
      await (await repo()).mergeInto(duplicateId, targetId);
      notifyChanged();
      return null;
    },
    'organize/page': async ({ tabId }) => {
      const id = await resolveTabId(tabId);
      await inject(id);
      const page = await sendTabMessage(id, 'content/pageMarkdown', {});
      return { cards: await organize(await client(), page.markdown), url: page.url, pageTitle: page.pageTitle };
    },
    'organize/text': async ({ text }) => ({ cards: await organize(await client(), text) }),
    'organize/keep': async ({ cards, page }) => {
      const ids = await (await repo()).addCards(cards, page);
      notifyChanged();
      return { kept: ids.length };
    },
    'nodes/setMastery': async ({ id, mastery }) => {
      await (await repo()).setMastery(id, mastery ?? undefined);
      notifyChanged();
      return null;
    },
    'quiz/due': async () => (await repo()).dueForQuiz(isConfigured(await loadSettings())),
    'quiz/problem': async ({ nodeId }) => ({ problem: await problemFor(await repo(), await client(), nodeId) }),
    'quiz/grade': async ({ nodeId, answer, verdict }) => {
      const review = await selfGrade(await repo(), nodeId, answer, verdict);
      notifyChanged();
      return review;
    },
    'quiz/judge': async ({ nodeId, answer, problem }) => {
      const review = await judge(await repo(), await client(), nodeId, answer, problem);
      notifyChanged();
      return review;
    },
    'explain/check': async ({ nodeId, explanation }) => {
      const result = await checkExplanation(await repo(), await client(), nodeId, explanation);
      notifyChanged();
      return result;
    },
    'explain/oneMinute': async ({ nodeId }) => ({ script: await oneMinuteScript(await repo(), await client(), nodeId) }),
    'stats/get': async () => (await repo()).stats(),
    'settings/get': async () => toPublic(await loadSettings()),
    'settings/save': async ({ baseUrl, model, embeddingModel, apiKey }) => {
      const current = await loadSettings();
      const url = new URL(baseUrl.trim()); // throws on an invalid URL
      if (!/^https?:$/.test(url.protocol)) throw new UserError('error.baseUrlProtocol');
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
    'data/exportOpml': async () => nodesToOpml(await (await repo()).listNodes(), new Date()),
    'data/exportAnki': async () => nodesToAnki(await (await repo()).listNodes()),
    'data/importJson': async ({ json }) => {
      const result = await (await repo()).importData(json);
      notifyChanged();
      return result;
    },
    'recording/get': () => loadRecording(),
    'recording/setOrigins': async ({ origins }) => {
      const next = await setRecordingOrigins(origins);
      notifyChanged();
      return next;
    },
    'recording/setPaused': async ({ paused }) => {
      const next = { ...(await loadRecording()), paused };
      await saveRecording(next);
      await showRecordingBadge(next);
      notifyChanged();
      return next;
    },
    'asks/record': async ({ text }, sender) => {
      // The gate uses the page the message came from, never anything the page could claim.
      const url = sender.url;
      if (!url || sender.id !== browser.runtime.id || !shouldRecord(await loadRecording(), url)) return { recorded: false };
      const host = new URL(url).hostname;
      await (await repo()).recordAsk({ site: siteFor(host)?.id ?? host, conversationUrl: url, text });
      notifyChanged();
      return { recorded: true };
    },
    'asks/list': async () => (await repo()).listAsks(),
    'asks/delete': async ({ id }) => {
      await (await repo()).deleteAsk(id);
      notifyChanged();
      return null;
    },
    'asks/clear': async () => {
      await (await repo()).clearAsks();
      notifyChanged();
      return null;
    },
    'asks/exclude': async ({ conversationUrl }) => {
      const current = await loadRecording();
      const url = conversationUrl.replace(/#.*$/, '');
      const next = { ...current, excluded: [...new Set([...current.excluded, url])] };
      await saveRecording(next);
      await (await repo()).deleteConversationAsks(url);
      notifyChanged();
      return next;
    },
    'asks/export': async () =>
      JSON.stringify({ format: 'chat2know-asks', version: 1, exportedAt: Date.now(), asks: await (await repo()).listAsks() }, null, 2),
  });
});
