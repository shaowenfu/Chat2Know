import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { onMessages, type Envelope } from '@/src/messaging';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { UserError } from '@/src/errors';
import { loadSettings, saveSettings, toPublic } from '@/src/llm/settings';
import { isRecording, loadSites, saveSites, shouldRecord, type SiteSettings } from '@/src/sites/settings';
import { recordItem, type RecordResult } from '@/src/services/record';
import { placeItem } from '@/src/services/placement';
import { isConfigured } from '@/src/llm/settings';
import { errorText } from '@/src/errors';
import type { TextQuote } from '@/src/capture/text-quote';
import { sendTabMessage } from '@/src/messaging';
import { siteFor } from '@/src/capture/sites';
import { i18n } from '#i18n';
import { EXPORT_FORMAT, EXPORT_VERSION, parseImport, type ExportFile } from '@/src/export/json';
import { mapToMarkdown } from '@/src/export/markdown';
import { mapToOpml } from '@/src/export/opml';

const SITE_SCRIPT = '/content-scripts/site.js';
const SITE_SCRIPT_ID = 'chat2know-site';
const MENU_ID = 'chat2know-record';

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

function notifyChanged(): void {
  const event: Envelope<'event/dataChanged'> = { type: 'event/dataChanged', payload: {} };
  // Rejects when no extension page is open; that is fine.
  browser.runtime.sendMessage(event).catch(() => {});
}

const matchesOf = (origins: string[]) => origins.map((o) => `${o}/*`);

/** Runs the site script on exactly the ticked origins; the "REC" badge shows while it records questions. */
async function registerSiteScript(s: SiteSettings): Promise<void> {
  if ((await browser.scripting.getRegisteredContentScripts({ ids: [SITE_SCRIPT_ID] })).length) {
    await browser.scripting.unregisterContentScripts({ ids: [SITE_SCRIPT_ID] });
  }
  if (s.origins.length) {
    await browser.scripting.registerContentScripts([
      { id: SITE_SCRIPT_ID, matches: matchesOf(s.origins), js: [SITE_SCRIPT], runAt: 'document_idle' },
    ]);
  }
  await showRecordingBadge(s);
}

async function showRecordingBadge(s: SiteSettings): Promise<void> {
  await browser.action.setBadgeText({ text: isRecording(s) ? 'REC' : '' });
  await browser.action.setBadgeBackgroundColor({ color: '#b3261e' });
}

async function inject(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ target: { tabId }, files: [SITE_SCRIPT] });
}

async function setSiteOrigins(origins: string[]): Promise<SiteSettings> {
  const previous = await loadSites();
  const next = { ...previous, origins: [...new Set(origins.map((o) => new URL(o).origin))] };
  await saveSites(next);
  await registerSiteScript(next);
  // Open tabs get the script now; one that cannot be scripted (discarded, an error page) gets it on its next load.
  const added = next.origins.filter((o) => !previous.origins.includes(o));
  if (added.length) {
    const tabs = await browser.tabs.query({ url: matchesOf(added) });
    await Promise.allSettled(tabs.map((t) => inject(t.id!)));
  }
  return next;
}

/** Alt+S or the context menu: the tab was granted by the gesture; the site script records its selection. */
async function recordSelection(tabId: number): Promise<void> {
  await inject(tabId); // a no-op where it already runs
  await sendTabMessage(tabId, 'site/recordSelection', {});
}

/**
 * After a record: with a model set up, the item moves to where it belongs and the
 * page's toast follows. Without one it stays where it was put. A failure is shown
 * on the page; the item keeps its place.
 */
async function placeAfterRecord(result: Extract<RecordResult, { status: 'recorded' }>, quote: TextQuote, tabId: number): Promise<void> {
  const settings = await loadSettings();
  if (!isConfigured(settings)) return;
  let reply: { itemId: string; path?: string[]; error?: string };
  try {
    const { unplaced, newSubject } = labels();
    const path = await placeItem(await repo(), new LlmClient(settings), settings.embeddingModel, {
      itemId: result.itemId,
      group: result.group,
      before: quote.prefix,
      after: quote.suffix,
      untitled: newSubject,
      unplaced,
    });
    if (!path) return;
    notifyChanged();
    reply = { itemId: result.itemId, path };
  } catch (err) {
    reply = { itemId: result.itemId, error: errorText(err) };
  }
  // The tab may have closed meanwhile; the map has the result either way.
  await sendTabMessage(tabId, 'site/placed', reply).catch(() => {});
}

const labels = (): { unplaced: string; newSubject: string } => ({ unplaced: i18n.t('map.unplaced'), newSubject: i18n.t('map.newSubject') });

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Registered scripts survive restarts; re-registering on install / update keeps them in step with the settings.
  browser.runtime.onStartup.addListener(() => void loadSites().then(showRecordingBadge));
  browser.runtime.onInstalled.addListener(() => {
    void loadSites().then(registerSiteScript);
    browser.contextMenus.create({ id: MENU_ID, title: i18n.t('menu.record'), contexts: ['selection'] });
  });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'record-selection' && tab?.id !== undefined) void recordSelection(tab.id);
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab?.id !== undefined) void recordSelection(tab.id);
  });

  onMessages({
    ping: ({ from }) => ({ from: 'background', echo: from, at: Date.now() }),
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
      return toPublic(next);
    },
    'settings/test': async () => ({ reply: await (await client()).chat([{ role: 'user', content: 'Reply with the single word OK.' }]) }),
    'sites/get': () => loadSites(),
    'sites/setOrigins': async ({ origins }) => {
      const next = await setSiteOrigins(origins);
      notifyChanged();
      return next;
    },
    'sites/setRecordAsks': async ({ on }) => {
      const next = { ...(await loadSites()), recordAsks: on };
      await saveSites(next);
      await showRecordingBadge(next);
      notifyChanged();
      return next;
    },
    'map/record': async ({ itemType, title, latex, quote, pageTitle, force }, sender) => {
      // The source is the page the message came from, never a URL the page could claim.
      const url = sender.url;
      if (!url || sender.id !== browser.runtime.id || sender.tab === undefined) throw new Error('map/record comes only from a page');
      const source = { url, pageTitle, quoteExact: quote.exact, quotePrefix: quote.prefix, quoteSuffix: quote.suffix, capturedAt: Date.now() };
      const result = await recordItem(await repo(), { itemType, title, ...(latex === undefined ? {} : { latex }), source, ...(force ? { force } : {}) }, labels());
      notifyChanged();
      if (result.status === 'recorded') void placeAfterRecord(result, quote, sender.tab.id!);
      return result;
    },
    'map/undo': async ({ group }) => {
      const undone = (await (await repo()).undo(group)) !== null;
      notifyChanged();
      return { undone };
    },
    'asks/record': async ({ text }, sender) => {
      // The gate uses the page the message came from, never anything the page could claim.
      const url = sender.url;
      if (!url || sender.id !== browser.runtime.id || !shouldRecord(await loadSites(), url)) return { recorded: false };
      const host = new URL(url).hostname;
      await (await repo()).recordAsk({ site: siteFor(host)?.id ?? host, conversationUrl: url, text });
      notifyChanged();
      return { recorded: true };
    },
    'map/export': async ({ format, includeGrey }) => {
      const r = await repo();
      if (format === 'json') {
        const file: ExportFile = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: Date.now(), nodes: await r.exportNodes() };
        return JSON.stringify(file, null, 2);
      }
      const trees = await Promise.all((await r.listSubjects()).map((s) => r.subjectTree(s.id)));
      const options = { unplacedTitle: i18n.t('map.unplaced'), includeGrey: includeGrey ?? false };
      return format === 'markdown' ? mapToMarkdown(trees, options) : mapToOpml(trees, options, new Date());
    },
    'map/import': async ({ json }) => {
      const file = parseImport(json);
      const r = await repo();
      if (file.version === 2) await r.importNodes(file.nodes);
      else await r.importItems(i18n.t('map.importedSubject'), file.items);
      notifyChanged();
      return { nodes: file.version === 2 ? file.nodes.length : file.items.length };
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
      const current = await loadSites();
      const url = conversationUrl.replace(/#.*$/, '');
      const next = { ...current, excluded: [...new Set([...current.excluded, url])] };
      await saveSites(next);
      await (await repo()).deleteConversationAsks(url);
      notifyChanged();
      return next;
    },
  });
});
