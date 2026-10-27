<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { CandidateCard } from '@/src/llm/prompts';
import { NOTIFY, useRun } from '../notify';

/**
 * Organize a whole page or pasted text: the model proposes cards, the user
 * goes through them once (keep, edit or uncheck) and keeps the rest in one go.
 */
const props = defineProps<{ source: 'page' | 'paste' }>();
const emit = defineEmits<{ done: [] }>();
const notify = inject(NOTIFY)!;
const run = useRun();

interface Row extends CandidateCard {
  keep: boolean;
}

const text = ref('');
const busy = ref(false);
const rows = ref<Row[] | null>(null);
const page = ref<{ url: string; pageTitle: string } | undefined>(undefined);
const selected = computed(() => rows.value?.filter((r) => r.keep) ?? []);

async function start() {
  busy.value = true;
  const res = await run(async () =>
    props.source === 'page' ? sendMessage('organize/page', {}) : { ...(await sendMessage('organize/text', { text: text.value })), url: '', pageTitle: '' },
  );
  busy.value = false;
  if (!res) return;
  page.value = res.url ? { url: res.url, pageTitle: res.pageTitle } : undefined;
  rows.value = res.cards.map((c) => ({ ...c, keep: true }));
}

async function keep() {
  const cards = selected.value.map((r) => ({ title: r.question, summary: r.summary, quote: r.quote }));
  const res = await run(() => sendMessage('organize/keep', { cards, ...(page.value ? { page: page.value } : {}) }));
  if (!res) return;
  notify(i18n.t('organize.kept', res.kept));
  emit('done');
}

if (props.source === 'page') void start();
</script>

<template>
  <section class="organize" data-testid="organize">
    <h2>{{ source === 'page' ? i18n.t('organize.pageTitle') : i18n.t('organize.pasteTitle') }}</h2>

    <form v-if="source === 'paste' && !rows" class="keep-form" @submit.prevent="start">
      <textarea v-model="text" rows="8" required :placeholder="i18n.t('organize.pastePlaceholder')" :aria-label="i18n.t('organize.pastePlaceholder')" />
      <div class="row-actions">
        <button type="submit" data-testid="organize-start" :disabled="busy">{{ busy ? i18n.t('organize.working') : i18n.t('organize.start') }}</button>
        <button type="button" class="link" @click="emit('done')">{{ i18n.t('keep.cancel') }}</button>
      </div>
    </form>

    <p v-if="busy && source === 'page'" class="muted">{{ i18n.t('organize.working') }}</p>

    <template v-if="rows">
      <p v-if="rows.length === 0" class="empty" data-testid="organize-none">{{ i18n.t('organize.none') }}</p>
      <ul class="cards">
        <li v-for="(row, i) in rows" :key="i" class="card" :class="{ off: !row.keep }" data-testid="organize-row">
          <label class="choice">
            <input v-model="row.keep" type="checkbox" :aria-label="i18n.t('organize.keepThis')">
            <input v-model="row.question" class="custom grow" type="text" :aria-label="i18n.t('keep.pickTitle')">
          </label>
          <textarea v-model="row.summary" rows="2" class="custom" :aria-label="i18n.t('keep.summary')" />
          <blockquote class="quote">{{ row.quote }}</blockquote>
        </li>
      </ul>
      <div class="row-actions">
        <button type="button" data-testid="organize-keep" :disabled="selected.length === 0" @click="keep">
          {{ i18n.t('organize.keepSelected', selected.length) }}
        </button>
        <button type="button" class="link" @click="emit('done')">{{ i18n.t('keep.cancel') }}</button>
      </div>
    </template>
  </section>
</template>
