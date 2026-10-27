<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { NodeView } from '@/src/db/types';

defineProps<{ items: NodeView[] }>();
const emit = defineEmits<{ openSource: [sourceId: string]; notice: [text: string] }>();

const editing = ref<string | null>(null);
const draft = ref('');
const editor = ref<HTMLInputElement[]>([]);

function questionText(item: NodeView): string {
  return item.title || i18n.t('queue.about', [item.term ?? '']);
}

/** Splits the quoted sentence so the asked-about term can be emphasized. */
function parts(item: NodeView): [string, string, string] {
  const quote = item.sources[0]?.quoteExact ?? '';
  const term = item.term ?? '';
  const at = term ? quote.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return [quote, '', ''];
  return [quote.slice(0, at), quote.slice(at, at + term.length), quote.slice(at + term.length)];
}

async function startEdit(item: NodeView) {
  editing.value = item.id;
  draft.value = item.title;
  await nextTick();
  editor.value[0]?.focus();
}

async function saveEdit(item: NodeView) {
  await sendMessage('ask/update', { id: item.id, question: draft.value });
  editing.value = null;
}

async function copyFollowUp(item: NodeView) {
  const question = item.title || i18n.t('ask.chipWhat', [item.term ?? '']);
  await navigator.clipboard.writeText(i18n.t('queue.followUp', [item.sources[0]?.quoteExact ?? '', question]));
  emit('notice', i18n.t('queue.copied'));
}

async function remove(item: NodeView) {
  await sendMessage('nodes/delete', { id: item.id });
}
</script>

<template>
  <p v-if="items.length === 0" class="empty" data-testid="queue-empty">{{ i18n.t('queue.empty') }}</p>
  <ul class="cards">
    <li v-for="item in items" :key="item.id" class="card question" data-testid="queue-item">
      <form v-if="editing === item.id" class="edit" @submit.prevent="saveEdit(item)">
        <input ref="editor" v-model="draft" :aria-label="i18n.t('queue.edit')" :placeholder="i18n.t('ask.placeholder')">
        <button type="submit">{{ i18n.t('queue.save') }}</button>
      </form>
      <div v-else class="title" :class="{ muted: !item.title }" data-testid="queue-question">{{ questionText(item) }}</div>
      <blockquote class="quote" data-testid="queue-quote">{{ parts(item)[0] }}<mark>{{ parts(item)[1] }}</mark>{{ parts(item)[2] }}</blockquote>
      <div class="meta">
        <button
          v-if="item.sources[0]"
          type="button"
          class="link source"
          :title="item.sources[0].url"
          @click="emit('openSource', item.sources[0].id)"
        >
          ↗ {{ item.sources[0].pageTitle || item.sources[0].url }}
        </button>
        <span v-if="item.askCount > 1" class="repeat" data-testid="queue-repeat">{{ i18n.t('queue.askedTimes', [String(item.askCount)]) }}</span>
      </div>
      <div class="row-actions">
        <button v-if="editing !== item.id" type="button" class="link" @click="startEdit(item)">{{ item.title ? i18n.t('queue.editExisting') : i18n.t('queue.edit') }}</button>
        <button type="button" class="link" data-testid="queue-copy" @click="copyFollowUp(item)">{{ i18n.t('queue.copy') }}</button>
        <button type="button" class="link danger" @click="remove(item)">{{ i18n.t('queue.remove') }}</button>
      </div>
    </li>
  </ul>
</template>
