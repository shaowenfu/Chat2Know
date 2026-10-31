<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { isEnvelope, sendMessage, type SubjectSummary } from '@/src/messaging';
import { errorText } from '@/src/errors';
import MapView from './MapView.vue';
import SettingsView from './SettingsView.vue';
import { download, stamp } from './download';

const GREY_KEY = 'chat2know.showGrey';

/** The full page: `#settings`, or `#<subjectId>` for a subject's map. */
const hash = ref(location.hash.slice(1));
const subjects = ref<SubjectSummary[]>([]);
const error = ref('');
const adding = ref(false);
const newTitle = ref('');
const version = ref(0); // bumps on every data change so the views reload
const showGrey = ref(readShowGrey());

function readShowGrey(): boolean {
  try {
    return localStorage.getItem(GREY_KEY) !== 'false';
  } catch {
    return true; // storage blocked: the toggle is a convenience
  }
}
function setShowGrey(on: boolean) {
  showGrey.value = on;
  try {
    localStorage.setItem(GREY_KEY, String(on));
  } catch {
    // storage blocked: the toggle is a convenience
  }
}

const FORMATS = [
  { format: 'json', ext: 'json', type: 'application/json', label: 'settings.exportJson' },
  { format: 'markdown', ext: 'md', type: 'text/markdown', label: 'settings.exportMarkdown' },
  { format: 'opml', ext: 'opml', type: 'text/x-opml', label: 'settings.exportOpml' },
] as const;

async function exportAs(f: (typeof FORMATS)[number]) {
  await run(async () => {
    const text = await sendMessage('map/export', { format: f.format, includeGrey: showGrey.value });
    download(`chat2know-${stamp()}.${f.ext}`, text, f.type);
  });
}

const isSettings = computed(() => hash.value === 'settings');
const currentId = computed(() => (subjects.value.some((s) => s.id === hash.value) ? hash.value : subjects.value[0]?.id));

async function run(action: () => Promise<unknown>) {
  try {
    error.value = '';
    await action();
  } catch (err) {
    error.value = errorText(err);
  }
}

async function load() {
  subjects.value = await sendMessage('map/subjects', {});
  version.value++;
}

function go(to: string) {
  location.hash = to;
}

async function addSubject() {
  const title = newTitle.value.trim();
  adding.value = false;
  newTitle.value = '';
  if (title) await run(async () => go((await sendMessage('map/addSubject', { title })).id));
}

const onHash = () => (hash.value = location.hash.slice(1));
function onMessage(message: unknown) {
  if (isEnvelope(message) && message.type === 'event/dataChanged') void run(load);
}
onMounted(() => {
  void run(load);
  window.addEventListener('hashchange', onHash);
  browser.runtime.onMessage.addListener(onMessage);
});
onUnmounted(() => {
  window.removeEventListener('hashchange', onHash);
  browser.runtime.onMessage.removeListener(onMessage);
});
</script>

<template>
  <div class="page">
    <header class="bar">
      <span class="brand">{{ i18n.t('extName') }}</span>
      <nav class="tabs">
        <template v-if="!isSettings">
          <a v-for="s in subjects" :key="s.id" :href="`#${s.id}`" :class="{ on: s.id === currentId }" data-testid="subject-tab">{{ s.title }}</a>
          <input
            v-if="adding"
            v-model="newTitle"
            class="new-subject"
            :placeholder="i18n.t('mapPage.newSubjectPlaceholder')"
            @keydown.enter.prevent="addSubject"
            @keydown.esc="adding = false"
            @blur="addSubject"
          >
          <button v-else type="button" class="tab-button" @click="adding = true">{{ i18n.t('mapPage.newSubject') }}</button>
        </template>
        <template v-else>
          <a :href="`#${currentId ?? ''}`">{{ i18n.t('mapPage.mapTab') }}</a>
          <a href="#settings" class="on">{{ i18n.t('mapPage.settingsTab') }}</a>
        </template>
      </nav>
      <div class="grow" />
      <template v-if="!isSettings">
        <label class="toggle">
          <input type="checkbox" :checked="showGrey" data-testid="show-grey" @change="setShowGrey(($event.target as HTMLInputElement).checked)">
          {{ i18n.t('mapPage.showOutline') }}
        </label>
        <details class="export">
          <summary class="button">{{ i18n.t('mapPage.export') }}</summary>
          <div class="export-menu">
            <button v-for="f in FORMATS" :key="f.format" type="button" @click="exportAs(f)">{{ i18n.t(f.label) }}</button>
          </div>
        </details>
        <a href="#settings" class="icon" :aria-label="i18n.t('mapPage.settingsTab')" :title="i18n.t('mapPage.settingsTab')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </a>
      </template>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <SettingsView v-if="isSettings" @error="error = $event" />
    <MapView v-else :subject-id="currentId" :subjects="subjects" :version="version" :show-grey="showGrey" @error="error = $event" />
  </div>
</template>
