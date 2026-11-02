import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { onMessages, type Envelope } from '@/src/messaging';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { UserError } from '@/src/errors';
import { loadSettings, saveSettings, toPublic } from '@/src/llm/settings';
import { isRecording, loadSites, migrateV01Sites, saveSites, shouldRecord, type SiteSettings } from '@/src/sites/settings';
import { recordItem, type RecordResult } from '@/src/services/record';
import { placeItem, placeUnplaced } from '@/src/services/placement';
import { textFragmentUrl } from '@/src/capture/text-fragment';
import { outlineOfferable, proposeOutline } from '@/src/services/outline';
import { EMPTY_STATE, analyze, dismissGap, fillGap, gapMarks, gapCard, judgeGap, nextGap, proposeFill, quizGap, type GapState } from '@/src/services/gaps';
import { loadOutlines, saveOutline } from '@/src/outline/state';
import { moveByUser, parentPath, placeOptions, searchPlaces } from '@/src/services/relocate';
import { isConfigured } from '@/src/llm/settings';
import { errorText } from '@/src/errors';
import type { TextQuote } from '@/src/capture/text-quote';
import { sendTabMessage } from '@/src/messaging';
import { siteFor } from '@/src/capture/sites';
import { currentLang, i18n, initI18n, loadUiLang, saveUiLang } from '@/src/i18n';
import { EXPORT_FORMAT, EXPORT_VERSION, parseImport, type ExportFile } from '@/src/export/json';
import { loadOpenMap, saveOpenMap } from '@/src/sites/open-map';
import type { PromptLang } from '@/src/llm/prompts';
import { mapToMarkdown } from '@/src/export/markdown';
import { mapToOpml } from '@/src/export/opml';

const SITE_SCRIPT = '/content-scripts/site.js';
const SITE_SCRIPT_ID = 'chat2know-site';
const MENU_ID = 'chat2know-record';
const QUOTE_MENU_ID = 'chat2know-record-quote';
/** 0.1's question recorder; its script file is gone in 0.2. */
const V01_RECORDER_ID = 'chat2know-recorder';

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
async function recordSelection(tabId: number, as?: 'quote'): Promise<void> {
  await inject(tabId); // a no-op where it already runs
  await sendTabMessage(tabId, 'site/recordSelection', as ? { as } : {});
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
    const { unplaced } = labels();
    const path = await placeItem(await repo(), new LlmClient(settings), settings.embeddingModel, {
      itemId: result.itemId,
      group: result.group,
      before: quote.prefix,
      after: quote.suffix,
      lang: promptLang(),
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

let placing: Promise<void> = Promise.resolve();

/** With a model set up, the items waiting in 待归位 go to their places; one run at a time. */
function placeWaiting(): Promise<void> {
  placing = placing
    .catch(() => {}) // a failed run already surfaced (to its caller, or in the extension's error log); the next one still runs
    .then(async () => {
      await ready();
      const settings = await loadSettings();
      if (!isConfigured(settings)) return;
      if (await placeUnplaced(await repo(), new LlmClient(settings), settings.embeddingModel, { unplaced: labels().unplaced, lang: promptLang() })) notifyChanged();
    });
  return placing;
}

const GAP_ALARM = 'chat2know-gaps';
const GAP_STATE = 'gapState';
/** A conversation counts as over 10 minutes after its last question. */
const CONVERSATION_IDLE_MIN = 10;
/** Tabs that sent recorded questions in this session: closing one ends its conversation. */
const askingTabs = new Set<number>();

async function loadGapState(): Promise<GapState> {
  return ((await browser.storage.local.get(GAP_STATE))[GAP_STATE] as GapState | undefined) ?? EMPTY_STATE;
}
const saveGapState = (state: GapState) => browser.storage.local.set({ [GAP_STATE]: state });

let analyzing: Promise<void> = Promise.resolve();

/** After a conversation (idle, closed, or the side panel opened): new questions are tagged and gaps marked. One run at a time. */
function analyzeGaps(): Promise<void> {
  analyzing = analyzing
    .catch(() => {}) // a failed run already surfaced (to its caller, or in the extension's error log); the next one still runs
    .then(async () => {
      const settings = await loadSettings();
      if (!isConfigured(settings)) return;
      const r = await repo();
      const before = (await r.listGaps()).length;
      await saveGapState(await analyze(r, new LlmClient(settings), settings.embeddingModel, Date.now(), await loadGapState()));
      if ((await r.listGaps()).length !== before) notifyChanged();
    });
  return analyzing;
}

/** The user's language is read once at start and followed after; strings and prompts wait for it. */
let i18nReady: Promise<void> | undefined;
// The context menu speaks the chosen language too.
const renameMenus = () => {
  void browser.contextMenus.update(MENU_ID, { title: i18n.t('menu.record') });
  void browser.contextMenus.update(QUOTE_MENU_ID, { title: i18n.t('menu.recordQuote') });
};
const ready = () => (i18nReady ??= initI18n(renameMenus));

const labels = (): { unplaced: string; unnamed: string } => ({ unplaced: i18n.t('map.unplaced'), unnamed: i18n.t('map.unnamed') });

/** Prompts are written in the user's language. */
const promptLang = (): PromptLang => (currentLang() === 'zh_CN' ? 'zh' : 'en');

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Registered scripts survive restarts; re-registering on install / update keeps them in step with the settings.
  browser.runtime.onStartup.addListener(() => void loadSites().then(showRecordingBadge));
  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      if ((await browser.scripting.getRegisteredContentScripts({ ids: [V01_RECORDER_ID] })).length) {
        await browser.scripting.unregisterContentScripts({ ids: [V01_RECORDER_ID] });
      }
      await migrateV01Sites();
      await registerSiteScript(await loadSites());
    })();
    // onInstalled also fires when the browser updates, while the menu still exists.
    void ready()
      .then(() => browser.contextMenus.removeAll())
      .then(() => {
        browser.contextMenus.create({ id: MENU_ID, title: i18n.t('menu.record'), contexts: ['selection'] });
        browser.contextMenus.create({ id: QUOTE_MENU_ID, title: i18n.t('menu.recordQuote'), contexts: ['selection'] });
      });
  });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'record-selection' && tab?.id !== undefined) void recordSelection(tab.id);
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === GAP_ALARM) void analyzeGaps();
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    if (askingTabs.delete(tabId)) void analyzeGaps();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) return;
    if (info.menuItemId === MENU_ID) void recordSelection(tab.id);
    if (info.menuItemId === QUOTE_MENU_ID) void recordSelection(tab.id, 'quote');
  });

  onMessages({
    ping: ({ from }) => ({ from: 'background', echo: from, at: Date.now() }),
    'settings/get': async () => toPublic(await loadSettings()),
    'ui/getLang': () => loadUiLang(),
    'ui/setLang': async ({ lang }) => {
      await saveUiLang(lang); // every open page follows the change (and reloads)
      return null;
    },
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
      void placeWaiting();
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
    'map/record': async ({ itemType, title, latex, quote, pageTitle, force, createMap }, sender) => {
      // The source is the page the message came from, never a URL the page could claim.
      const url = sender.url;
      if (!url || sender.id !== browser.runtime.id || sender.tab === undefined) throw new Error('map/record comes only from a page');
      const source = { url, pageTitle, quoteExact: quote.exact, quotePrefix: quote.prefix, quoteSuffix: quote.suffix, capturedAt: Date.now() };
      const r = await repo();
      // "新建导图并记下": the user asked for a new, unnamed map; it opens and takes this note.
      if (createMap) await saveOpenMap((await r.addSubject('')).node.id);
      const result = await recordItem(r, await loadOpenMap(), { itemType, title, ...(latex === undefined ? {} : { latex }), source, ...(force ? { force } : {}) }, labels());
      notifyChanged();
      if (result.status === 'recorded') void placeAfterRecord(result, quote, sender.tab.id!);
      return result;
    },
    'map/subjects': async () => {
      const r = await repo();
      const open = await loadOpenMap();
      return Promise.all(
        (await r.listSubjects()).map(async (s) => {
          const items = (await r.subjectNodes(s.id)).filter((n) => n.kind === 'item');
          return { id: s.id, title: s.title, items: items.length, latest: Math.max(0, ...items.map((n) => n.createdAt)), open: s.id === open };
        }),
      );
    },
    'maps/open': async ({ id }) => {
      if ((await (await repo()).node(id)).kind !== 'subject') throw new Error(`${id} is not a map`);
      await saveOpenMap(id);
      notifyChanged();
      return null;
    },
    'map/tree': async ({ subjectId }) => (await repo()).subjectTree(subjectId),
    'map/moveNode': async ({ id, parentId, beforeId }) => {
      const r = await repo();
      const group = await r.move(id, parentId, beforeId);
      if ((await r.node(id)).kind === 'item') await r.notePlacementChange(id, await parentPath(r, id, labels()));
      notifyChanged();
      return { group };
    },
    'map/edit': async ({ id, title, latex }) => {
      const group = await (await repo()).edit(id, { ...(title === undefined ? {} : { title }), ...(latex === undefined ? {} : { latex }) });
      notifyChanged();
      return { group };
    },
    'map/remove': async ({ id }) => {
      const group = await (await repo()).remove(id);
      // A deleted map is no longer open; the user opens another.
      if (id === (await loadOpenMap())) await saveOpenMap(null);
      notifyChanged();
      return { group };
    },
    'map/addSubject': async ({ title }) => {
      // A map the user creates opens at once.
      const { node } = await (await repo()).addSubject(title);
      await saveOpenMap(node.id);
      notifyChanged();
      return { id: node.id };
    },
    'map/addSection': async ({ parentId, title, beforeId }) => {
      const { node } = await (await repo()).addSection(parentId, title, 'user', beforeId);
      notifyChanged();
      return { id: node.id };
    },
    'map/addItem': async ({ parentId, itemType, text }) => {
      const input = itemType === 'formula' ? { itemType, title: '', latex: text.trim() } : { itemType, title: text };
      const { node } = await (await repo()).addItem({ parentId }, input);
      notifyChanged();
      return { id: node.id };
    },
    'map/clear': async () => {
      await (await repo()).clearAll();
      notifyChanged();
      return null;
    },
    'map/openSource': async ({ itemId }) => {
      const { source } = await (await repo()).node(itemId);
      if (!source) throw new Error(`Item ${itemId} has no source`);
      await browser.tabs.create({ url: textFragmentUrl(source.url, { exact: source.quoteExact, prefix: source.quotePrefix, suffix: source.quoteSuffix }), active: true });
      return null;
    },
    'outline/state': async ({ subjectId }) => {
      const decision = (await loadOutlines())[subjectId];
      const tree = await (await repo()).subjectTree(subjectId);
      // An unnamed map has no subject to outline yet.
      const offerable = !!tree.node.title.trim() && outlineOfferable(tree) && isConfigured(await loadSettings());
      const open = decision?.status !== 'laid' && decision?.status !== 'declined';
      const fresh = decision?.outline && decision.forTitle === tree.node.title;
      return { offer: offerable && open, ...(open && fresh ? { outline: decision.outline } : {}) };
    },
    'outline/propose': async ({ subjectId, toc }) => {
      const r = await repo();
      const outline = await proposeOutline(r, new LlmClient(await loadSettings()), subjectId, promptLang(), toc);
      await saveOutline(subjectId, { status: 'proposed', outline, forTitle: (await r.node(subjectId)).title });
      return outline;
    },
    'outline/apply': async ({ subjectId }) => {
      const outline = (await loadOutlines())[subjectId]?.outline;
      if (!outline) throw new Error(`No outline proposed for ${subjectId}`);
      const group = await (await repo()).layOutline(subjectId, outline);
      await saveOutline(subjectId, { status: 'laid' });
      notifyChanged();
      void placeWaiting();
      return { group };
    },
    'outline/decline': async ({ subjectId }) => {
      await saveOutline(subjectId, { status: 'declined' });
      notifyChanged();
      return null;
    },
    'gaps/check': async () => {
      await analyzeGaps();
      return null;
    },
    'gaps/view': async ({ subjectId }) => {
      const r = await repo();
      const marks = await gapMarks(r, subjectId);
      if (!isConfigured(await loadSettings())) return { marks };
      const next = await nextGap(r, subjectId, Date.now(), await loadGapState());
      if (!next) return { marks };
      await saveGapState(next.state);
      return { marks, card: next.card };
    },
    'gaps/marks': async ({ subjectId }) => gapMarks(await repo(), subjectId),
    'gaps/forSection': async ({ sectionId }) => {
      const r = await repo();
      const gap = (await r.listGaps()).find((g) => g.sectionId === sectionId && (g.status === 'suspected' || g.status === 'asked'));
      return gap ? gapCard(r, gap.id) : null;
    },
    'gaps/proposeFill': async ({ gapId }) => proposeFill(await repo(), new LlmClient(await loadSettings()), gapId),
    'gaps/fill': async ({ gapId, skip }) => {
      const group = await fillGap(await repo(), gapId, skip, Date.now());
      notifyChanged();
      return { group };
    },
    'gaps/quiz': async ({ gapId }) => ({ question: await quizGap(await repo(), new LlmClient(await loadSettings()), gapId) }),
    'gaps/judge': async ({ gapId, answer }) => {
      const verdict = await judgeGap(await repo(), new LlmClient(await loadSettings()), gapId, answer, Date.now());
      if (verdict.correct) notifyChanged();
      return verdict;
    },
    'gaps/dismiss': async ({ gapId }) => {
      await dismissGap(await repo(), gapId, Date.now());
      notifyChanged();
      return null;
    },
    'map/placeOptions': async ({ itemId }) => {
      const r = await repo();
      const settings = await loadSettings();
      const client = isConfigured(settings) ? new LlmClient(settings) : null;
      return { now: await parentPath(r, itemId, labels()), places: await placeOptions(r, client, settings.embeddingModel, itemId, labels().unnamed) };
    },
    'map/searchPlaces': async ({ query }) => searchPlaces(await repo(), query, labels().unnamed),
    'map/moveItem': async ({ itemId, placeId, newTopic }) => {
      const result = await moveByUser(await repo(), itemId, { placeId, ...(newTopic ? { newTopic } : {}) }, labels());
      notifyChanged();
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
      if (sender.tab?.id !== undefined) askingTabs.add(sender.tab.id);
      await browser.alarms.create(GAP_ALARM, { delayInMinutes: CONVERSATION_IDLE_MIN });
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
      const options = { unplacedTitle: i18n.t('map.unplaced'), unnamedTitle: i18n.t('map.unnamed'), includeGrey: includeGrey ?? false };
      return format === 'markdown' ? mapToMarkdown(trees, options) : mapToOpml(trees, options, new Date());
    },
    'map/import': async ({ json }) => {
      const nodes = parseImport(json);
      await (await repo()).importNodes(nodes);
      notifyChanged();
      void placeWaiting();
      return { nodes: nodes.length };
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
  }, ready);
});
