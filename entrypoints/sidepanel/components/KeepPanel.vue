<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { Suggestion } from '@/src/llm/prompts';
import TitlePicker from './TitlePicker.vue';
import { useRun } from '../notify';

/** Recording suggestion for one answer: what kind of thing it is, what to keep, and the user's final say. */
const props = defineProps<{ inboxId: string; questionId?: string }>();
const emit = defineEmits<{ done: [] }>();
const run = useRun();

const suggestion = ref<Suggestion | null>(null);
const title = ref('');
const summary = ref('');
const concept = ref('');
const keepAnyway = ref(false);

const hint = computed(() => {
  const s = suggestion.value;
  if (!s) return '';
  if (s.kind === 'instance') return i18n.t('keep.hintInstance', [s.concept ?? '']);
  if (s.kind === 'curiosity') return i18n.t('keep.hintCuriosity');
  return i18n.t('keep.hintConcept');
});

onMounted(async () => {
  const s = await run(() => sendMessage('keep/suggest', { inboxId: props.inboxId }));
  if (!s) return emit('done');
  suggestion.value = s;
  title.value = s.titles[0]!;
  summary.value = s.summary;
  concept.value = s.concept ?? '';
});

async function confirm() {
  const s = suggestion.value!;
  const decision = { title: title.value, summary: summary.value, ...(s.kind === 'instance' && concept.value.trim() ? { concept: concept.value } : {}) };
  const ok = await run(() => sendMessage('keep/confirm', { inboxId: props.inboxId, suggestion: s, decision }));
  if (ok !== undefined) emit('done');
}

async function skip() {
  if (props.questionId) await run(() => sendMessage('ask/dismiss', { questionId: props.questionId!, suggestion: suggestion.value! }));
  emit('done');
}
</script>

<template>
  <div class="keep" data-testid="keep-panel">
    <p v-if="!suggestion" class="muted">{{ i18n.t('keep.thinking') }}</p>
    <template v-else>
      <p class="hint" data-testid="keep-hint">{{ hint }}</p>
      <div v-if="suggestion.kind === 'curiosity' && !keepAnyway" class="row-actions">
        <button type="button" data-testid="keep-skip" @click="skip">{{ i18n.t('keep.dontKeep') }}</button>
        <button type="button" class="link" @click="keepAnyway = true">{{ i18n.t('keep.keepAnyway') }}</button>
      </div>
      <form v-else class="keep-form" @submit.prevent="confirm">
        <TitlePicker v-model="title" :candidates="suggestion.titles" />
        <label class="field">
          <span>{{ i18n.t('keep.summary') }}</span>
          <textarea v-model="summary" rows="3" data-testid="keep-summary" />
        </label>
        <label v-if="suggestion.kind === 'instance'" class="field">
          <span>{{ i18n.t('keep.concept') }}</span>
          <input v-model="concept" type="text" data-testid="keep-concept">
        </label>
        <div class="row-actions">
          <button type="submit" data-testid="keep-confirm">{{ i18n.t('keep.confirm') }}</button>
          <button type="button" class="link" @click="emit('done')">{{ i18n.t('keep.cancel') }}</button>
        </div>
      </form>
    </template>
  </div>
</template>
