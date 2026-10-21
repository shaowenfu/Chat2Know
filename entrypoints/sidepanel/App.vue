<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { onMessages, sendMessage } from '@/src/messaging';
import type { NodeView } from '@/src/db/types';

const nodes = ref<NodeView[]>([]);
const toolbarUnavailable = ref(false);
const notice = ref<{ text: string; error: boolean } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const countLabel = computed(() => i18n.t('panel.cardCount', nodes.value.length));

async function refresh() {
  nodes.value = await sendMessage('nodes/list', {});
}

async function activate() {
  try {
    await sendMessage('page/activate', {});
    toolbarUnavailable.value = false;
  } catch {
    toolbarUnavailable.value = true;
  }
}

function flash(text: string, error = false) {
  notice.value = { text, error };
  setTimeout(() => (notice.value = null), 4000);
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
    flash(i18n.t('panel.imported', result.nodes));
  } catch (err) {
    flash(i18n.t('panel.importFailed', [err instanceof Error ? err.message : String(err)]), true);
  }
}

async function openSource(sourceId: string) {
  try {
    await sendMessage('source/open', { sourceId });
  } catch {
    flash(i18n.t('panel.sourceUnavailable'), true);
  }
}

async function remove(id: string) {
  await sendMessage('nodes/delete', { id });
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const onTabActivated = () => void activate();

onMessages({
  'event/nodesChanged': async () => {
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
    <header>
      <h1>Chat2Know</h1>
      <p class="tagline">{{ i18n.t('panel.tagline') }}</p>
    </header>

    <p v-if="toolbarUnavailable" class="hint" data-testid="toolbar-unavailable">{{ i18n.t('panel.toolbarUnavailable') }}</p>

    <section class="actions">
      <span class="count" data-testid="card-count">{{ countLabel }}</span>
      <button type="button" data-testid="export-json" @click="exportJson">{{ i18n.t('panel.exportJson') }}</button>
      <button type="button" data-testid="export-md" @click="exportMarkdown">{{ i18n.t('panel.exportMarkdown') }}</button>
      <button type="button" data-testid="import-json" @click="fileInput?.click()">{{ i18n.t('panel.importJson') }}</button>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden data-testid="import-input" @change="importJson">
    </section>

    <p v-if="notice" class="notice" :class="{ error: notice.error }" role="status">{{ notice.text }}</p>

    <p v-if="nodes.length === 0" class="empty" data-testid="empty">{{ i18n.t('panel.empty') }}</p>

    <ul class="cards">
      <li v-for="node in nodes" :key="node.id" class="card" data-testid="card">
        <div class="card-head">
          <span class="badge" :data-type="node.type">{{ i18n.t(`type.${node.type}`) }}</span>
          <button type="button" class="link danger" :aria-label="i18n.t('panel.delete')" @click="remove(node.id)">{{ i18n.t('panel.delete') }}</button>
        </div>
        <div class="title">{{ node.title }}</div>
        <pre class="body">{{ node.body }}</pre>
        <button
          v-for="source in node.sources"
          :key="source.id"
          type="button"
          class="link source"
          data-testid="open-source"
          :title="source.url"
          @click="openSource(source.id)"
        >
          ↗ {{ source.pageTitle || host(source.url) }}
        </button>
      </li>
    </ul>
  </main>
</template>
