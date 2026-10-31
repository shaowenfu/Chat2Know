import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { onMessages, type Envelope } from '@/src/messaging';
import { Chat2KnowDB } from '@/src/db/schema';
import { Hlc } from '@/src/db/hlc';
import { Repository } from '@/src/db/repository';
import { LlmClient } from '@/src/llm/client';
import { UserError } from '@/src/errors';
import { loadSettings, saveSettings, toPublic } from '@/src/llm/settings';
import { isRecording, loadRecording, saveRecording, shouldRecord, type RecordingSettings } from '@/src/recording/settings';
import { siteFor } from '@/src/capture/sites';

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

function notifyChanged(): void {
  const event: Envelope<'event/dataChanged'> = { type: 'event/dataChanged', payload: {} };
  // Rejects when no extension page is open; that is fine.
  browser.runtime.sendMessage(event).catch(() => {});
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

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Registered scripts survive restarts; re-registering on install / update keeps them in step with the settings.
  browser.runtime.onStartup.addListener(() => void loadRecording().then(showRecordingBadge));
  browser.runtime.onInstalled.addListener(() => void loadRecording().then(registerRecorder));

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
  });
});
