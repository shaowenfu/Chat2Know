<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import { SITES } from '@/src/capture/sites';
import { UserError } from '@/src/errors';
import type { Ask } from '@/src/db/types';
import type { RecordingSettings } from '@/src/recording/settings';
import { NOTIFY, useRun } from '../notify';

/** Learning diagnosis: which sites record the questions you send, and what was recorded. */
const props = defineProps<{ asks: Ask[]; recording: RecordingSettings }>();
const notify = inject(NOTIFY)!;
const run = useRun();

const siteOrigins = (hosts: string[]) => hosts.map((h) => `https://${h}`);
/** The current tab's site, offered when no site config covers it (it then uses the generic rule). */
const here = ref<string | null>(null);
onMounted(async () => {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const origin = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).origin : null;
  const known = SITES.some((s) => siteOrigins(s.hosts).includes(origin ?? ''));
  here.value = origin && !known ? origin : null;
});

const options = computed(() => [
  ...SITES.map((s) => ({ key: s.id, label: s.name, origins: siteOrigins(s.hosts) })),
  ...[...new Set([...(here.value ? [here.value] : []), ...props.recording.origins])]
    .filter((o) => !SITES.some((s) => siteOrigins(s.hosts).includes(o)))
    .map((o) => ({ key: o, label: new URL(o).host, origins: [o] })),
]);
const isOn = (origins: string[]) => origins.every((o) => props.recording.origins.includes(o));

async function toggle(origins: string[], on: boolean) {
  await run(async () => {
    // Host access is asked for exactly the ticked site, at the moment it is ticked.
    if (on && !(await browser.permissions.request({ origins: origins.map((o) => `${o}/*`) }))) {
      throw new UserError('learn.permissionDenied', [origins.join(', ')]);
    }
    const next = on ? [...props.recording.origins, ...origins] : props.recording.origins.filter((o) => !origins.includes(o));
    await sendMessage('recording/setOrigins', { origins: next });
  });
}

const search = ref('');
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q ? props.asks.filter((a) => a.text.toLowerCase().includes(q)) : props.asks;
});

const siteName = (site: string) => SITES.find((s) => s.id === site)?.name ?? site;
const when = (at: number) => new Date(at).toLocaleString();

async function clearAll() {
  if (window.confirm(i18n.t('learn.clearConfirm'))) await run(() => sendMessage('asks/clear', {}));
}

async function exportAsks() {
  const json = await run(() => sendMessage('asks/export', {}));
  if (json === undefined) return;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat2know-questions-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exclude(ask: Ask) {
  const ok = await run(() => sendMessage('asks/exclude', { conversationUrl: ask.conversationUrl }));
  if (ok) notify(i18n.t('learn.excluded'));
}
</script>

<template>
  <section class="learn" data-testid="learn">
    <p class="muted small" data-testid="learn-privacy">{{ i18n.t('learn.privacy') }}</p>
    <fieldset class="sites">
      <legend>{{ i18n.t('learn.sites') }}</legend>
      <label v-for="o in options" :key="o.key" class="site">
        <input type="checkbox" :checked="isOn(o.origins)" :data-testid="`site-${o.key}`" @change="toggle(o.origins, ($event.target as HTMLInputElement).checked)">
        {{ o.label }}
      </label>
    </fieldset>
    <div v-if="recording.origins.length" class="row-actions">
      <button type="button" data-testid="recording-pause" :aria-pressed="recording.paused" @click="run(() => sendMessage('recording/setPaused', { paused: !recording.paused }))">
        {{ recording.paused ? i18n.t('learn.resume') : i18n.t('learn.pause') }}
      </button>
      <span class="muted" data-testid="recording-state">{{ recording.paused ? i18n.t('learn.paused') : i18n.t('learn.recording') }}</span>
    </div>

    <h2>{{ i18n.t('learn.asksTitle', asks.length) }}</h2>
    <template v-if="asks.length">
      <input v-model="search" type="search" class="search" :placeholder="i18n.t('learn.search')" :aria-label="i18n.t('learn.search')">
      <div class="row-actions">
        <button type="button" data-testid="asks-export" @click="exportAsks">{{ i18n.t('learn.export') }}</button>
        <button type="button" class="danger" data-testid="asks-clear" @click="clearAll">{{ i18n.t('learn.clear') }}</button>
      </div>
    </template>
    <p v-else class="empty" data-testid="asks-empty">{{ i18n.t('learn.noAsks') }}</p>
    <ul class="asks">
      <li v-for="ask in shown" :key="ask.id" class="ask" data-testid="ask">
        <span class="ask-text">{{ ask.text }}</span>
        <span class="muted small">
          <a :href="ask.conversationUrl" target="_blank" rel="noopener">{{ siteName(ask.site) }}</a> · {{ when(ask.sentAt) }}
        </span>
        <span class="row-actions">
          <button type="button" class="link" data-testid="ask-exclude" @click="exclude(ask)">{{ i18n.t('learn.exclude') }}</button>
          <button type="button" class="link danger" data-testid="ask-delete" @click="run(() => sendMessage('asks/delete', { id: ask.id }))">{{ i18n.t('panel.delete') }}</button>
        </span>
      </li>
    </ul>
  </section>
</template>
