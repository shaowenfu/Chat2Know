<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { NodeView } from '@/src/db/types';
import MasteryPicker from './MasteryPicker.vue';
import TitlePicker from './TitlePicker.vue';
import { useRun } from '../notify';

const props = defineProps<{ cards: NodeView[]; configured: boolean }>();
const emit = defineEmits<{ openSource: [sourceId: string] }>();
const run = useRun();

/** Chosen title per draft card, starting at the first candidate. */
const picks = ref<Record<string, string>>({});
watchEffect(() => {
  for (const n of props.cards) if (n.titleCandidates) picks.value[n.id] ??= n.titleCandidates[0]!;
});

async function confirmTitle(node: NodeView) {
  await run(() => sendMessage('nodes/confirmTitle', { id: node.id, title: picks.value[node.id]! }));
}

async function retry(node: NodeView) {
  await run(() => sendMessage('nodes/retryDistill', { id: node.id }));
}

async function remove(node: NodeView) {
  await run(() => sendMessage('nodes/delete', { id: node.id }));
}

function host(url: string): string {
  return URL.canParse(url) ? new URL(url).host : url;
}
</script>

<template>
  <p v-if="cards.length === 0" class="empty" data-testid="empty">{{ i18n.t('panel.empty') }}</p>
  <ul class="cards">
    <li v-for="node in cards" :key="node.id" class="card" data-testid="card">
      <div class="card-head">
        <span v-if="node.type === 'idea'" class="badge" data-type="idea">{{ i18n.t('type.idea') }}</span>
        <button type="button" class="link danger" :aria-label="i18n.t('panel.delete')" @click="remove(node)">{{ i18n.t('panel.delete') }}</button>
      </div>
      <div class="title" data-testid="card-title">{{ node.title }}</div>
      <p v-if="node.summary" class="summary" data-testid="card-summary">{{ node.summary }}</p>

      <template v-if="node.status === 'draft' && node.type === 'knowledge'">
        <form v-if="node.titleCandidates" class="keep-form" @submit.prevent="confirmTitle(node)">
          <TitlePicker v-model="picks[node.id]!" :candidates="node.titleCandidates" />
          <div class="row-actions">
            <button type="submit" data-testid="card-confirm">{{ i18n.t('keep.confirm') }}</button>
          </div>
        </form>
        <p v-else-if="node.distillError" class="error" data-testid="card-error">
          {{ i18n.t('card.distillFailed', [node.distillError]) }}
          <button type="button" class="link" data-testid="card-retry" @click="retry(node)">{{ i18n.t('card.retry') }}</button>
        </p>
        <p v-else class="muted" data-testid="card-pending">{{ configured ? i18n.t('card.distilling') : i18n.t('card.needsModel') }}</p>
      </template>

      <MasteryPicker v-if="node.type === 'knowledge' && node.status !== 'draft'" :node="node" />
      <pre v-if="node.body" class="body">{{ node.body }}</pre>
      <button
        v-for="source in node.sources"
        :key="source.id"
        type="button"
        class="link source"
        data-testid="open-source"
        :title="source.url"
        @click="emit('openSource', source.id)"
      >
        ↗ {{ source.pageTitle || host(source.url) }}
      </button>
    </li>
  </ul>
</template>
