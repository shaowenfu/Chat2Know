<script setup lang="ts">
import { computed, ref } from 'vue';
import { i18n } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';
import { errorText } from '@/src/errors';
import type { StuckCard } from '@/src/services/stuck';
import type { StuckKind } from '@/src/db/types';

/**
 * The gentle card when the latest check saw the learner stuck (artboard 15): where
 * they may be stuck, what to get clear first, and a better question to copy. Only
 * in the side panel; "不用" keeps this map quiet for the rest of the day.
 */
const props = defineProps<{ card: StuckCard }>();
const emit = defineEmits<{ done: [] }>();

const COPIED_MS = 1500;
const showAsks = ref(false);
const copied = ref(false);
const error = ref('');

/** "好像在「矩阵乘法」这里绕了几圈", or without a topic "最近的问题好像在绕圈子". */
const TITLES: Record<StuckKind, (topic?: string) => string> = {
  circling: (t) => (t ? i18n.t('stuck.circlingAt', [t]) : i18n.t('stuck.circling')),
  stuck: (t) => (t ? i18n.t('stuck.stuckAt', [t]) : i18n.t('stuck.stuck')),
  offTarget: (t) => (t ? i18n.t('stuck.offTargetAt', [t]) : i18n.t('stuck.offTarget')),
  phrasing: (t) => (t ? i18n.t('stuck.phrasingAt', [t]) : i18n.t('stuck.phrasing')),
};
const title = computed(() => TITLES[props.card.kind](props.card.path.at(-1)));

async function copy() {
  await navigator.clipboard.writeText(props.card.betterQuestion);
  copied.value = true;
  setTimeout(() => (copied.value = false), COPIED_MS);
}

async function dismiss() {
  try {
    await sendMessage('stuck/dismiss', { checkId: props.card.checkId });
    emit('done');
  } catch (err) {
    error.value = errorText(err);
  }
}
</script>

<template>
  <section class="stuck" data-testid="stuck-card" :aria-label="title">
    <span class="title">{{ title }}</span>
    <span class="explain">{{ card.explanation }}</span>
    <div class="better">
      <span class="label">{{ i18n.t('stuck.tryAsking') }}</span>
      <span class="question" data-testid="better-question">{{ card.betterQuestion }}</span>
    </div>
    <ol v-if="showAsks" class="asks" data-testid="stuck-asks">
      <li v-for="(a, i) in card.asks" :key="i">{{ a }}</li>
    </ol>
    <div class="buttons">
      <button type="button" class="primary grow" @click="copy">{{ copied ? i18n.t('stuck.copied') : i18n.t('stuck.copy') }}</button>
      <button v-if="card.asks.length" type="button" class="secondary" :aria-expanded="showAsks" @click="showAsks = !showAsks">
        {{ showAsks ? i18n.t('stuck.hideAsks') : i18n.t('stuck.showAsks') }}
      </button>
      <button type="button" class="plain" @click="dismiss">{{ i18n.t('stuck.no') }}</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.stuck {
  padding: 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1.5px solid #b4480f;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}
.explain {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-2);
}
.better {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 8px;
  background: var(--orange-soft);
}
.label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--orange);
}
.question {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
}
.asks {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.buttons {
  display: flex;
  gap: 6px;
}
button {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.grow {
  flex: 1;
}
.primary {
  border: 0;
  background: #b4480f;
  color: #ffffff;
  font-weight: 500;
}
.secondary {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
}
.plain {
  border: 0;
  background: transparent;
  color: var(--ink-2);
}
.error {
  margin: 0;
  font-size: 12px;
  color: #b4480f;
}
</style>
