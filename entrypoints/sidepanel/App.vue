<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { onMessages, sendMessage } from '@/src/messaging';
import type { InboxItem, NodeView } from '@/src/db/types';
import type { PublicSettings } from '@/src/llm/settings';
import AskQueue from './components/AskQueue.vue';
import CardList from './components/CardList.vue';
import QuizView from './components/QuizView.vue';
import SettingsView from './components/SettingsView.vue';
import { NOTIFY, errorText } from './notify';

type View = 'queue' | 'cards' | 'quiz' | 'settings';
const view = ref<View>('cards');

const nodes = ref<NodeView[]>([]);
const inbox = ref<InboxItem[]>([]);
const settings = ref<PublicSettings | null>(null);
const due = ref<NodeView[]>([]);
const stats = ref({ masteredThisWeek: 0, due: 0, mustKnow: 0, openQuestions: 0 });
const toolbarUnavailable = ref(false);
const notice = ref<{ text: string; error: boolean } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function notify(text: string, error = false) {
  notice.value = { text, error };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = null), error ? 8000 : 4000);
}
provide(NOTIFY, notify);

// Ask-later questions live in their own queue; everything else is a card.
const queue = computed(() => nodes.value.filter((n) => n.type === 'question' && n.status === 'open'));
const cards = computed(() => nodes.value.filter((n) => n.type !== 'question'));
const countLabel = computed(() => i18n.t('panel.cardCount', cards.value.length));
const configured = computed(() => Boolean(settings.value?.baseUrl && settings.value.model && settings.value.hasKey));

const titles = computed(() => new Map(nodes.value.map((n) => [n.id, n.title])));

/** Latest answer per open question. */
const answers = computed(() => {
  const map = new Map<string, InboxItem>();
  for (const item of inbox.value) if (!item.promotedNodeId && !map.has(item.questionNodeId)) map.set(item.questionNodeId, item);
  return map;
});
/** Answers whose question was dismissed: still keepable until they expire. */
const leftovers = computed(() => {
  const open = new Set(queue.value.map((q) => q.id));
  return inbox.value.filter((i) => !i.promotedNodeId && !open.has(i.questionNodeId));
});

async function refresh() {
  [nodes.value, inbox.value, settings.value, due.value, stats.value] = await Promise.all([
    sendMessage('nodes/list', {}),
    sendMessage('inbox/list', {}),
    sendMessage('settings/get', {}),
    sendMessage('quiz/due', {}),
    sendMessage('stats/get', {}),
  ]);
}

async function activate() {
  try {
    await sendMessage('page/activate', {});
    toolbarUnavailable.value = false;
  } catch {
    // Expected on pages we may not script (chrome://, the store, tabs without activeTab).
    toolbarUnavailable.value = true;
  }
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

async function exportJson() {
  download(`chat2know-${stamp()}.json`, await sendMessage('data/exportJson', {}), 'application/json');
}

async function exportMarkdown() {
  download(`chat2know-${stamp()}.md`, await sendMessage('data/exportMarkdown', {}), 'text/markdown');
}

async function importJson(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const result = await sendMessage('data/importJson', { json: await file.text() });
    notify(i18n.t('panel.imported', result.nodes));
  } catch (err) {
    notify(i18n.t('panel.importFailed', [errorText(err)]), true);
  }
}

async function openSource(sourceId: string) {
  try {
    await sendMessage('source/open', { sourceId });
  } catch (err) {
    notify(errorText(err), true);
  }
}

const onTabActivated = () => void activate();

onMessages({
  'event/dataChanged': async () => {
    await refresh();
    return null;
  },
});

onMounted(() => {
  void refresh();
  void activate();
  browser.tabs.onActivated.addListener(onTabActivated);
});

onUnmounted(() => browser.tabs.onActivated.removeListener(onTabActivated));
</script>

<template>
  <main class="panel">
    <header class="top">
      <div>
        <h1>Chat2Know</h1>
        <p class="tagline">{{ i18n.t('panel.tagline') }}</p>
      </div>
      <button
        type="button"
        class="gear"
        :aria-pressed="view === 'settings'"
        :aria-label="i18n.t('settings.title')"
        data-testid="open-settings"
        @click="view = view === 'settings' ? 'cards' : 'settings'"
      >
        ⚙
      </button>
    </header>

    <p v-if="toolbarUnavailable" class="hint" data-testid="toolbar-unavailable">{{ i18n.t('panel.toolbarUnavailable') }}</p>
    <p v-if="settings && !configured && view !== 'settings'" class="hint" data-testid="needs-model">
      {{ i18n.t('settings.needed') }}
      <button type="button" class="link" @click="view = 'settings'">{{ i18n.t('settings.title') }}</button>
    </p>

    <p v-if="notice" class="notice" :class="{ error: notice.error }" role="status">{{ notice.text }}</p>

    <SettingsView v-if="view === 'settings' && settings" :key="settings.baseUrl + settings.model" :settings="settings" />

    <template v-else>
      <nav class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="view === 'queue'" data-testid="tab-queue" @click="view = 'queue'">
          {{ i18n.t('queue.tab') }}<span v-if="queue.length" class="pill">{{ queue.length }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="view === 'cards'" data-testid="tab-cards" @click="view = 'cards'">
          {{ i18n.t('queue.cardsTab') }}<span v-if="cards.length" class="pill">{{ cards.length }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="view === 'quiz'" data-testid="tab-quiz" @click="view = 'quiz'">
          {{ i18n.t('quiz.tab') }}<span v-if="due.length" class="pill">{{ due.length }}</span>
        </button>
      </nav>

      <QuizView v-if="view === 'quiz'" :due="due" :configured="configured" :stats="stats" />

      <AskQueue v-else-if="view === 'queue'" :items="queue" :answers="answers" :leftovers="leftovers" :titles="titles" @open-source="openSource" />

      <template v-else>
        <section class="actions">
          <span class="count" data-testid="card-count">{{ countLabel }}</span>
          <button type="button" data-testid="export-json" @click="exportJson">{{ i18n.t('panel.exportJson') }}</button>
          <button type="button" data-testid="export-md" @click="exportMarkdown">{{ i18n.t('panel.exportMarkdown') }}</button>
          <button type="button" data-testid="import-json" @click="fileInput?.click()">{{ i18n.t('panel.importJson') }}</button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden data-testid="import-input" @change="importJson">
        </section>
        <CardList :cards="cards" :configured="configured" @open-source="openSource" />
      </template>
    </template>
  </main>
</template>
