<script setup lang="ts">
import { inject, nextTick, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { InboxItem, NodeView } from '@/src/db/types';
import FollowUp from './FollowUp.vue';
import KeepPanel from './KeepPanel.vue';
import { NOTIFY, useRun } from '../notify';

const props = defineProps<{ items: NodeView[]; answers: Map<string, InboxItem>; leftovers: InboxItem[]; titles: Map<string, string> }>();
const emit = defineEmits<{ openSource: [sourceId: string] }>();
const notify = inject(NOTIFY)!;
const run = useRun();

const editing = ref<string | null>(null);
const draft = ref('');
const editor = ref<HTMLInputElement[]>([]);
const answering = ref(new Set<string>());
/** Inbox id whose keep panel is open. */
const keeping = ref<string | null>(null);

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
  await run(() => sendMessage('ask/update', { id: item.id, question: draft.value }));
  editing.value = null;
}

async function answer(item: NodeView) {
  answering.value.add(item.id);
  await run(() => sendMessage('ask/answer', { questionId: item.id }));
  answering.value.delete(item.id);
}

async function copyFollowUp(item: NodeView) {
  const question = item.title || i18n.t('ask.chipWhat', [item.term ?? '']);
  await navigator.clipboard.writeText(i18n.t('queue.followUp', [item.sources[0]?.quoteExact ?? '', question]));
  notify(i18n.t('queue.copied'));
}

async function dismiss(item: NodeView) {
  await run(() => sendMessage('ask/dismiss', { questionId: item.id }));
}

const daysLeft = (item: InboxItem) => String(Math.max(1, Math.ceil((item.expiresAt - Date.now()) / 86_400_000)));
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
      <p v-if="item.parent?.kind === 'arose_from'" class="muted small" data-testid="queue-arose">
        {{ i18n.t('queue.arose', [props.titles.get(item.parent.id) ?? '']) }}
      </p>
      <blockquote v-if="item.sources[0]" class="quote" data-testid="queue-quote">{{ parts(item)[0] }}<mark>{{ parts(item)[1] }}</mark>{{ parts(item)[2] }}</blockquote>
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

      <div v-if="props.answers.get(item.id)" class="answer" data-testid="queue-answer">{{ props.answers.get(item.id)!.answer }}</div>
      <KeepPanel
        v-if="keeping && keeping === props.answers.get(item.id)?.id"
        :inbox-id="keeping"
        :question-id="item.id"
        @done="keeping = null"
      />

      <div v-if="!(keeping && keeping === props.answers.get(item.id)?.id)" class="row-actions">
        <template v-if="props.answers.get(item.id)">
          <button type="button" data-testid="queue-keep" @click="keeping = props.answers.get(item.id)!.id">{{ i18n.t('queue.keep') }}</button>
          <button type="button" class="link" data-testid="queue-dismiss" @click="dismiss(item)">{{ i18n.t('queue.dontKeep') }}</button>
          <FollowUp :parent-id="item.id" />
        </template>
        <button v-else type="button" data-testid="queue-answer-btn" :disabled="answering.has(item.id)" @click="answer(item)">
          {{ answering.has(item.id) ? i18n.t('queue.answering') : i18n.t('queue.askHere') }}
        </button>
        <button v-if="editing !== item.id" type="button" class="link" @click="startEdit(item)">{{ item.title ? i18n.t('queue.editExisting') : i18n.t('queue.edit') }}</button>
        <button v-if="item.sources[0]" type="button" class="link" data-testid="queue-copy" @click="copyFollowUp(item)">{{ i18n.t('queue.copy') }}</button>
        <button v-if="!props.answers.get(item.id)" type="button" class="link danger" @click="dismiss(item)">{{ i18n.t('queue.remove') }}</button>
      </div>
    </li>
  </ul>

  <section v-if="leftovers.length" class="leftovers" data-testid="inbox-leftovers">
    <h2>{{ i18n.t('inbox.title') }}</h2>
    <p class="muted">{{ i18n.t('inbox.explain') }}</p>
    <ul class="cards">
      <li v-for="it in leftovers" :key="it.id" class="card" data-testid="inbox-item">
        <div class="title">{{ it.question }}</div>
        <div class="answer">{{ it.answer }}</div>
        <KeepPanel v-if="keeping === it.id" :inbox-id="it.id" @done="keeping = null" />
        <div v-if="keeping !== it.id" class="row-actions">
          <button type="button" @click="keeping = it.id">{{ i18n.t('queue.keep') }}</button>
          <span class="muted">{{ i18n.t('inbox.expires', [daysLeft(it)]) }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>
