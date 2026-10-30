<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { onMessages, sendMessage } from '@/src/messaging';
import type { InboxItem, NodeView, QuizItem } from '@/src/db/types';
import type { RecordingSettings } from '@/src/recording/settings';
import type { AskView, Stats } from '@/src/db/repository';
import type { DiagnosisView } from '@/src/services/confirm';
import type { PublicSettings } from '@/src/llm/settings';
import AskQueue from './components/AskQueue.vue';
import CardList from './components/CardList.vue';
import LearnView from './components/LearnView.vue';
import OrganizeView from './components/OrganizeView.vue';
import PlacementPrompt from './components/PlacementPrompt.vue';
import QuizView from './components/QuizView.vue';
import SettingsView from './components/SettingsView.vue';
import { NOTIFY, errorText } from './notify';
import { PLACE } from './placement';
import { GAPS, type GapState } from './gaps';
import type { Placement } from '@/src/services/placement';

type View = 'queue' | 'cards' | 'quiz' | 'learn' | 'settings' | 'organize-page' | 'organize-paste';
const view = ref<View>('cards');

const nodes = ref<NodeView[]>([]);
const inbox = ref<InboxItem[]>([]);
const settings = ref<PublicSettings | null>(null);
const due = ref<QuizItem[]>([]);
const stats = ref<Stats>({ masteredThisWeek: 0, earlierWeeks: [0, 0, 0], due: 0, mustKnow: 0, openQuestions: 0 });
const asks = ref<AskView[]>([]);
const recording = ref<RecordingSettings>({ origins: [], paused: false, excluded: [] });
const analysis = ref<{ pending: number; lastError?: string }>({ pending: 0 });
const diagnoses = ref<DiagnosisView[]>([]);
const suspected = computed(() => diagnoses.value.filter((d) => d.status === 'suspected').length);
/** Diagnoses mark their concept's card on the map: possible gap, weak spot, or strengthened. */
provide(
  GAPS,
  computed(() => {
    const marks = new Map<string, GapState>();
    for (const d of diagnoses.value) {
      if (d.concept.nodeId) marks.set(d.concept.nodeId, d.remediated ? 'remediated' : d.status === 'confirmed' ? 'confirmed' : 'suspected');
    }
    return marks;
  }),
);
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

/** Placement suggestions for the card the user just kept, if any. */
const placing = ref<{ nodeId: string; placement: Placement } | null>(null);
provide(PLACE, async (nodeId: string) => {
  try {
    const placement = await sendMessage('place/suggest', { nodeId });
    if (placement && (placement.parents.length || placement.duplicate)) placing.value = { nodeId, placement };
  } catch (err) {
    notify(errorText(err), true);
  }
});

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
  [nodes.value, inbox.value, settings.value, due.value, stats.value, asks.value, recording.value, analysis.value, diagnoses.value] = await Promise.all([
    sendMessage('nodes/list', {}),
    sendMessage('inbox/list', {}),
    sendMessage('settings/get', {}),
    sendMessage('quiz/due', {}),
    sendMessage('stats/get', {}),
    sendMessage('asks/list', {}),
    sendMessage('recording/get', {}),
    sendMessage('analysis/get', {}),
    sendMessage('diagnosis/list', {}),
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

async function exportOpml() {
  download(`chat2know-${stamp()}.opml`, await sendMessage('data/exportOpml', {}), 'text/x-opml');
}

async function exportAnki() {
  download(`chat2know-anki-${stamp()}.csv`, await sendMessage('data/exportAnki', {}), 'text/csv');
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

    <PlacementPrompt
      v-if="placing && view !== 'settings'"
      :key="placing.nodeId"
      :node-id="placing.nodeId"
      :title="titles.get(placing.nodeId) ?? ''"
      :placement="placing.placement"
      @done="placing = null"
    />

    <OrganizeView v-if="view === 'organize-page' || view === 'organize-paste'" :source="view === 'organize-page' ? 'page' : 'paste'" @done="view = 'cards'" />

    <SettingsView v-else-if="view === 'settings' && settings" :key="settings.baseUrl + settings.model" :settings="settings" />

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
        <button type="button" role="tab" :aria-selected="view === 'learn'" data-testid="tab-learn" @click="view = 'learn'">
          {{ i18n.t('learn.tab') }}<span v-if="suspected" class="pill" data-testid="learn-pill">{{ suspected }}</span>
        </button>
      </nav>

      <LearnView v-if="view === 'learn'" :asks="asks" :recording="recording" :analysis="analysis" :diagnoses="diagnoses" :configured="configured" />

      <QuizView v-else-if="view === 'quiz'" :due="due" :configured="configured" :stats="stats" />

      <AskQueue v-else-if="view === 'queue'" :items="queue" :answers="answers" :leftovers="leftovers" :titles="titles" @open-source="openSource" />

      <template v-else>
        <section class="actions">
          <span class="count" data-testid="card-count">{{ countLabel }}</span>
          <details class="menu">
            <summary data-testid="export-menu">{{ i18n.t('panel.export') }}</summary>
            <div class="menu-items">
              <button type="button" data-testid="export-json" @click="exportJson">{{ i18n.t('panel.exportJson') }}</button>
              <button type="button" data-testid="export-md" @click="exportMarkdown">{{ i18n.t('panel.exportMarkdown') }}</button>
              <button type="button" data-testid="export-opml" @click="exportOpml">{{ i18n.t('panel.exportOpml') }}</button>
              <button type="button" data-testid="export-anki" @click="exportAnki">{{ i18n.t('panel.exportAnki') }}</button>
            </div>
          </details>
          <button type="button" data-testid="import-json" @click="fileInput?.click()">{{ i18n.t('panel.importJson') }}</button>
          <button type="button" data-testid="organize-page" :disabled="!configured" @click="view = 'organize-page'">{{ i18n.t('organize.page') }}</button>
          <button type="button" data-testid="organize-paste" :disabled="!configured" @click="view = 'organize-paste'">{{ i18n.t('organize.paste') }}</button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden data-testid="import-input" @change="importJson">
        </section>
        <CardList :cards="cards" :configured="configured" @open-source="openSource" />
      </template>
    </template>
  </main>
</template>
