<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { i18n } from '@/src/i18n';
import { sendMessage, type SubjectSummary } from '@/src/messaging';
import { errorText } from '@/src/errors';
import type { Ask, Report } from '@/src/db/types';
import { askPlace } from '@/src/services/report';
import { reportHtml } from '@/src/ui/report-html';

/**
 * The full page's 提问 tab (artboard 16): every recorded question, searchable,
 * filtered by map and deletable; beside it the selected map's written report,
 * made only when the user asks and kept with its earlier versions.
 */
const props = defineProps<{ subjects: SubjectSummary[]; version: number; configured: boolean }>();
const emit = defineEmits<{ error: [message: string] }>();

const ALL = '';
const NONE = '-';
const asks = ref<Ask[]>([]);
const query = ref('');
const filter = ref<string>(ALL);
/** The open map until the user picks a filter themselves. */
const picked = ref(false);
const reports = ref<Report[]>([]);
const reportId = ref<string>();
const generating = ref(false);

const mapIds = computed(() => new Set(props.subjects.map((s) => s.id)));
const map = computed(() => props.subjects.find((s) => s.id === filter.value));
const mapTitle = (s: SubjectSummary | undefined) => (s ? s.title || i18n.t('map.unnamed') : '');

/** The questions in the chosen map (or none, or all), newest first, that contain the search. */
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return asks.value.filter((a) => {
    const inMap = a.mapId !== undefined && mapIds.value.has(a.mapId);
    if (filter.value === NONE ? inMap : filter.value !== ALL && a.mapId !== filter.value) return false;
    return !q || a.text.toLowerCase().includes(q);
  });
});
const conversations = computed(() => new Set(shown.value.map((a) => a.conversationUrl)).size);
const mapAskCount = computed(() => asks.value.filter((a) => a.mapId === filter.value).length);
const report = computed(() => reports.value.find((r) => r.id === reportId.value));
const html = computed(() => (report.value ? reportHtml(report.value.markdown) : ''));

const locale = () => i18n.t('mapPage.dateLocale');
const when = (t: number) => new Date(t).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (err) {
    emit('error', errorText(err));
  }
}

async function load() {
  asks.value = await sendMessage('asks/list', {});
  await loadReports();
}

async function loadReports() {
  reports.value = map.value ? await sendMessage('reports/list', { mapId: map.value.id }) : [];
  if (!reports.value.some((r) => r.id === reportId.value)) reportId.value = reports.value[0]?.id;
}

async function remove(a: Ask) {
  await run(() => sendMessage('asks/delete', { id: a.id }));
}

async function generate() {
  if (!map.value) return;
  generating.value = true;
  try {
    const r = await sendMessage('reports/generate', { mapId: map.value.id });
    reportId.value = r.id;
    await loadReports();
  } catch (err) {
    emit('error', errorText(err));
  } finally {
    generating.value = false;
  }
}

watch(
  () => props.subjects,
  (subjects) => {
    if (!picked.value) filter.value = subjects.find((s) => s.open)?.id ?? ALL;
  },
  { immediate: true },
);
watch(() => props.version, () => void run(load), { immediate: true });
watch(filter, () => void run(loadReports));
</script>

<template>
  <div class="questions">
    <aside class="ask-list">
      <div class="ask-tools">
        <input v-model="query" type="search" class="ask-search" :placeholder="i18n.t('questions.search')" :aria-label="i18n.t('questions.search')" data-testid="ask-search">
        <select v-model="filter" class="ask-filter" :aria-label="i18n.t('questions.filter')" data-testid="ask-filter" @change="picked = true">
          <option :value="ALL">{{ i18n.t('questions.allMaps') }}</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">{{ mapTitle(s) }}</option>
          <option :value="NONE">{{ i18n.t('questions.noMap') }}</option>
        </select>
      </div>
      <span class="muted small" data-testid="ask-summary">
        {{ filter === ALL ? i18n.t('questions.allMaps') : filter === NONE ? i18n.t('questions.noMap') : mapTitle(map) }} ·
        {{ shown.length === 1 ? i18n.t('questions.countOne') : i18n.t('questions.count', [String(shown.length)]) }} ·
        {{ conversations === 1 ? i18n.t('questions.conversationsOne') : i18n.t('questions.conversations', [String(conversations)]) }}
      </span>
      <ul class="asks" data-testid="asks">
        <li v-for="a in shown" :key="a.id" class="ask">
          <span class="ask-meta">
            {{ when(a.sentAt) }} · <span :class="{ window: a.via === 'window' }">{{ askPlace(a, i18n.t('questions.window')) }}</span>
          </span>
          <span class="ask-text">{{ a.text }}</span>
          <button type="button" class="ask-delete" :aria-label="i18n.t('questions.delete')" :title="i18n.t('questions.delete')" @click="remove(a)">×</button>
        </li>
      </ul>
      <p v-if="!shown.length" class="muted small">{{ asks.length ? i18n.t('questions.noMatch') : i18n.t('questions.empty') }}</p>
    </aside>

    <main class="report-pane">
      <template v-if="map">
        <div class="report-head">
          <span class="report-title">{{ i18n.t('questions.reportTitle', [mapTitle(map)]) }}</span>
          <select v-if="reports.length" v-model="reportId" class="report-version" :aria-label="i18n.t('questions.versions')" data-testid="report-version">
            <option v-for="r in reports" :key="r.id" :value="r.id">{{ i18n.t('questions.madeAt', [when(r.createdAt)]) }}</option>
          </select>
          <div class="grow" />
          <button type="button" class="button primary" :disabled="generating || !mapAskCount || !configured" data-testid="generate-report" @click="generate">
            {{ generating ? i18n.t('questions.generating') : i18n.t('questions.generate') }}
          </button>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized to formatting tags (src/ui/report-html.ts) -->
        <article v-if="report" class="report" data-testid="report" v-html="html" />
        <p v-else class="muted report-empty">
          {{ !configured ? i18n.t('questions.noModel') : mapAskCount ? i18n.t('questions.noReport', [String(mapAskCount)]) : i18n.t('questions.noAsksInMap') }}
        </p>
        <span class="muted small">{{ i18n.t('questions.reportNote') }}</span>
      </template>
      <p v-else class="muted report-empty">{{ i18n.t('questions.pickMap') }}</p>
    </main>
  </div>
</template>

<style scoped>
.questions {
  flex: 1;
  display: flex;
  min-height: 0;
}
.ask-list {
  width: 440px;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 16px;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
  overflow-y: auto;
}
.ask-tools {
  display: flex;
  gap: 8px;
}
.ask-search,
.ask-filter,
.report-version {
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  background: var(--surface);
}
.ask-search {
  flex: 1;
  min-width: 0;
}
.ask-filter {
  max-width: 160px;
}
.asks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  font-size: 13px;
}
.ask {
  position: relative;
  padding: 10px 28px 10px 0;
  border-bottom: 1px solid #eeece6;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ask:last-child {
  border-bottom: 0;
}
.ask-meta {
  font-size: 11.5px;
  color: var(--muted);
}
.ask-meta .window {
  color: var(--accent);
}
.ask-text {
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.ask-delete {
  position: absolute;
  right: 0;
  top: 8px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font-size: 15px;
  cursor: pointer;
  opacity: 0;
}
.ask:hover .ask-delete,
.ask-delete:focus-visible {
  opacity: 1;
}
.ask-delete:hover {
  background: var(--bg-soft);
  color: var(--ink);
}
.report-pane {
  flex: 1;
  min-width: 0;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.report-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.report-title {
  font-size: 18px;
  font-weight: 700;
}
.report-version {
  height: 28px;
  font-size: 12px;
  color: var(--muted);
  border-color: transparent;
}
.button:disabled {
  opacity: 0.4;
  cursor: default;
}
.report {
  max-width: 680px;
  font-size: 14px;
  line-height: 1.8;
  color: #2a2925;
}
.report :deep(h1),
.report :deep(h2),
.report :deep(h3),
.report :deep(h4) {
  margin: 14px 0 6px;
  font-size: 16px;
  font-weight: 700;
}
.report :deep(h1:first-child),
.report :deep(h2:first-child),
.report :deep(h3:first-child) {
  margin-top: 0;
}
.report :deep(p),
.report :deep(ul),
.report :deep(ol),
.report :deep(blockquote) {
  margin: 0 0 12px;
}
.report :deep(ul),
.report :deep(ol) {
  padding-left: 20px;
}
.report :deep(blockquote) {
  padding-left: 12px;
  border-left: 3px solid var(--branch);
  color: var(--ink-2);
}
.report :deep(code) {
  font-family: var(--mono);
  font-size: 12.5px;
  background: var(--bg-soft);
  padding: 0 4px;
  border-radius: 4px;
}
.report :deep(table) {
  border-collapse: collapse;
  margin: 0 0 12px;
}
.report :deep(th),
.report :deep(td) {
  border: 1px solid var(--line);
  padding: 4px 8px;
}
.report-empty {
  max-width: 560px;
  font-size: 14px;
  line-height: 1.7;
}
</style>
