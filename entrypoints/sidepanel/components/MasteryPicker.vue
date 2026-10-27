<script setup lang="ts">
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { Mastery, NodeView } from '@/src/db/types';
import { useRun } from '../notify';

/** How well the user needs to know this card, in everyday words. Clicking the current choice clears it. */
const props = defineProps<{ node: NodeView }>();
const run = useRun();

const OPTIONS: { value: Mastery; label: () => string }[] = [
  { value: 'internalize', label: () => i18n.t('mastery.internalize') },
  { value: 'understand', label: () => i18n.t('mastery.understand') },
  { value: 'index', label: () => i18n.t('mastery.index') },
];

async function choose(value: Mastery) {
  const mastery = props.node.mastery === value ? null : value;
  await run(() => sendMessage('nodes/setMastery', { id: props.node.id, mastery }));
}
</script>

<template>
  <div class="mastery" role="group" :aria-label="i18n.t('mastery.label')">
    <button
      v-for="o in OPTIONS"
      :key="o.value"
      type="button"
      class="chip"
      :aria-pressed="node.mastery === o.value"
      :data-testid="`mastery-${o.value}`"
      @click="choose(o.value)"
    >
      {{ o.label() }}
    </button>
  </div>
</template>
