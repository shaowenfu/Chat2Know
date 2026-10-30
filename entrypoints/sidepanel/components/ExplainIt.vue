<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { ExplainResult } from '@/src/services/explain';
import { useRun } from '../notify';

/** "Explain it to me": explain this card and its branch in your own words; the model checks each kept card. */
const props = defineProps<{ nodeId: string }>();
const run = useRun();

const open = ref(false);
const text = ref('');
const busy = ref(false);
const result = ref<ExplainResult | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);

async function start() {
  open.value = true;
  result.value = null;
  await nextTick();
  input.value?.focus();
}

async function check() {
  busy.value = true;
  result.value = (await run(() => sendMessage('explain/check', { nodeId: props.nodeId, explanation: text.value }))) ?? null;
  busy.value = false;
  if (result.value) text.value = '';
}
</script>

<template>
  <button v-if="!open" type="button" class="link" data-testid="explain" @click="start">{{ i18n.t('explain.start') }}</button>
  <div v-else class="explain">
    <form v-if="!result" @submit.prevent="check">
      <textarea
        ref="input"
        v-model="text"
        rows="5"
        required
        :placeholder="i18n.t('explain.placeholder')"
        :aria-label="i18n.t('explain.placeholder')"
        :disabled="busy"
      />
      <div class="row-actions">
        <button type="submit" data-testid="explain-check" :disabled="busy || !text.trim()">{{ busy ? i18n.t('quiz.judging') : i18n.t('explain.check') }}</button>
        <button type="button" class="link" @click="open = false">{{ i18n.t('explain.close') }}</button>
      </div>
    </form>
    <template v-else>
      <p class="muted" data-testid="explain-feedback">{{ result.feedback }}</p>
      <ul class="points">
        <li v-for="p in result.points" :key="p.nodeId" :class="`verdict-${p.verdict}`" data-testid="explain-point">
          <strong>{{ i18n.t(`quiz.verdict_${p.verdict}`) }}</strong> · {{ p.title }}<span class="muted"> — {{ p.feedback }}</span>
        </li>
      </ul>
      <button type="button" class="link" @click="open = false">{{ i18n.t('explain.close') }}</button>
    </template>
  </div>
</template>
