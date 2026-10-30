<script setup lang="ts">
import { ref, watch } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { Mastery, NodeView } from '@/src/db/types';
import ExplainIt from './ExplainIt.vue';
import FollowUp from './FollowUp.vue';
import MasteryPicker from './MasteryPicker.vue';
import TitlePicker from './TitlePicker.vue';
import { useRun } from '../notify';
import { usePlace } from '../placement';

const props = defineProps<{ node: NodeView; configured: boolean; suggested?: Mastery }>();
const emit = defineEmits<{ openSource: [sourceId: string] }>();
const run = useRun();
const place = usePlace();

// Candidates arrive after distillation, possibly after this card was first rendered.
// Watch their content, not the array: every panel refresh brings a new array.
const pick = ref('');
watch(
  () => props.node.titleCandidates?.join('\n'),
  () => {
    if (props.node.titleCandidates) pick.value = props.node.titleCandidates[0]!;
  },
  { immediate: true },
);

async function confirmTitle() {
  const ok = await run(() => sendMessage('nodes/confirmTitle', { id: props.node.id, title: pick.value }));
  if (ok !== undefined) await place(props.node.id);
}

async function retry() {
  await run(() => sendMessage('nodes/retryDistill', { id: props.node.id }));
}

async function remove() {
  await run(() => sendMessage('nodes/delete', { id: props.node.id }));
}

const host = (url: string) => (URL.canParse(url) ? new URL(url).host : url);
</script>

<template>
  <article class="card" data-testid="card" :data-title="node.title">
    <div class="card-head">
      <span v-if="node.type === 'idea'" class="badge" data-type="idea">{{ i18n.t('type.idea') }}</span>
      <span v-if="node.lastVerdict === 'fail' || node.lastVerdict === 'partial'" class="badge flag" data-testid="card-flag">{{ i18n.t('card.missed') }}</span>
      <button type="button" class="link danger" :aria-label="i18n.t('panel.delete')" @click="remove">{{ i18n.t('panel.delete') }}</button>
    </div>
    <div class="title" data-testid="card-title">{{ node.title }}</div>
    <p v-if="node.summary" class="summary" data-testid="card-summary">{{ node.summary }}</p>

    <template v-if="node.status === 'draft' && node.type === 'knowledge'">
      <form v-if="node.titleCandidates" class="keep-form" @submit.prevent="confirmTitle">
        <TitlePicker v-model="pick" :candidates="node.titleCandidates" />
        <div class="row-actions">
          <button type="submit" data-testid="card-confirm">{{ i18n.t('keep.confirm') }}</button>
        </div>
      </form>
      <p v-else-if="node.distillError" class="error" data-testid="card-error">
        {{ i18n.t('card.distillFailed', [node.distillError]) }}
        <button type="button" class="link" data-testid="card-retry" @click="retry">{{ i18n.t('card.retry') }}</button>
      </p>
      <p v-else class="muted" data-testid="card-pending">{{ configured ? i18n.t('card.distilling') : i18n.t('card.needsModel') }}</p>
    </template>

    <div v-if="node.type === 'knowledge' && node.status !== 'draft'" class="row-actions">
      <MasteryPicker :node="node" :suggested="suggested" />
      <FollowUp :parent-id="node.id" />
    </div>
    <ExplainIt v-if="configured && (node.type === 'knowledge' || node.type === 'topic') && node.status !== 'draft'" :node-id="node.id" />
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
  </article>
</template>
