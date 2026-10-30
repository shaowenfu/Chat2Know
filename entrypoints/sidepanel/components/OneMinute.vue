<script setup lang="ts">
import { inject, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import { NOTIFY, useRun } from '../notify';

/** "Explain it in one minute": a script to say out loud, written from this card's branch. */
const props = defineProps<{ nodeId: string }>();
const notify = inject(NOTIFY)!;
const run = useRun();

const script = ref<string | null>(null);
const busy = ref(false);

async function write() {
  busy.value = true;
  script.value = (await run(() => sendMessage('explain/oneMinute', { nodeId: props.nodeId })))?.script ?? null;
  busy.value = false;
}

async function copy() {
  await run(() => navigator.clipboard.writeText(script.value!));
  notify(i18n.t('oneMinute.copied'));
}
</script>

<template>
  <button v-if="!script" type="button" class="link" data-testid="one-minute" :disabled="busy" @click="write">
    {{ busy ? i18n.t('oneMinute.writing') : i18n.t('oneMinute.start') }}
  </button>
  <div v-else class="script">
    <p data-testid="one-minute-script">{{ script }}</p>
    <div class="row-actions">
      <button type="button" class="link" data-testid="one-minute-copy" @click="copy">{{ i18n.t('oneMinute.copy') }}</button>
      <button type="button" class="link" @click="script = null">{{ i18n.t('explain.close') }}</button>
    </div>
  </div>
</template>
