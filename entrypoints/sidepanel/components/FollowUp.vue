<script setup lang="ts">
import { inject, nextTick, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import { NOTIFY, useRun } from '../notify';

/** Ask a follow-up about a card or an answer. The question becomes its child and is answered right away. */
const props = defineProps<{ parentId: string }>();
const notify = inject(NOTIFY)!;
const run = useRun();

const open = ref(false);
const question = ref('');
const busy = ref(false);
const input = ref<HTMLInputElement | null>(null);

async function start() {
  open.value = true;
  await nextTick();
  input.value?.focus();
}

async function ask() {
  busy.value = true;
  const item = await run(() => sendMessage('ask/followUp', { parentId: props.parentId, question: question.value }));
  busy.value = false;
  if (!item) return;
  question.value = '';
  open.value = false;
  notify(i18n.t('ask.answered'));
}
</script>

<template>
  <button v-if="!open" type="button" class="link" data-testid="follow-up" @click="start">{{ i18n.t('queue.followUpAsk') }}</button>
  <form v-else class="edit" @submit.prevent="ask">
    <input
      ref="input"
      v-model="question"
      required
      :placeholder="i18n.t('queue.followUpPlaceholder')"
      :aria-label="i18n.t('queue.followUpPlaceholder')"
      :disabled="busy"
    >
    <button type="submit" :disabled="busy">{{ busy ? i18n.t('queue.answering') : i18n.t('queue.askHere') }}</button>
  </form>
</template>
