<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { Verdict } from '@/src/db/types';
import type { DiagnosisView } from '@/src/services/confirm';
import { NOTIFY, useRun } from '../notify';

/**
 * One diagnosis: a hypothesis with the learner's own questions as evidence. The
 * learner checks it with a short quiz or says whether it is accurate; a confirmed
 * gap gets a systematic review kept as cards.
 */
const props = defineProps<{ diagnosis: DiagnosisView; configured: boolean }>();
const notify = inject(NOTIFY)!;
const run = useRun();
const d = computed(() => props.diagnosis);

const busy = ref(false);
const quiz = ref<{ question: string; expected: string }[] | null>(null);
const answers = ref<string[]>([]);
const results = ref<{ verdict: Verdict; feedback: string }[] | null>(null);
const review = ref<{ question: string; summary: string; keep: boolean }[] | null>(null);
const internalize = ref(true);

async function act<T>(action: () => Promise<T>): Promise<T | undefined> {
  busy.value = true;
  const out = await run(action);
  busy.value = false;
  return out;
}

async function startQuiz() {
  const res = await act(() => sendMessage('diagnosis/quiz', { id: d.value.id }));
  if (!res) return;
  quiz.value = res.items;
  answers.value = res.items.map(() => '');
}

async function checkQuiz() {
  const res = await act(() => sendMessage('diagnosis/checkQuiz', { id: d.value.id, items: quiz.value!, answers: answers.value }));
  if (!res) return;
  results.value = res.results;
  if (res.passed) notify(i18n.t('diag.withdrawn', [d.value.concept.name]));
}

async function decide(accurate: boolean) {
  await act(() => sendMessage('diagnosis/decide', { id: d.value.id, accurate }));
}

async function startReview() {
  const res = await act(() => sendMessage('diagnosis/review', { id: d.value.id }));
  if (res) review.value = res.cards.map((c) => ({ ...c, keep: true }));
}

async function keepReview() {
  const cards = review.value!.filter((c) => c.keep).map(({ question, summary }) => ({ question, summary }));
  const res = await act(() => sendMessage('diagnosis/keepReview', { id: d.value.id, cards, internalize: internalize.value }));
  if (!res) return;
  review.value = null;
  notify(i18n.t('diag.kept', res.kept));
}

const signalText = computed(() => d.value.signals.map((s) => i18n.t(`diag.signal_${s.kind}`, [String(s.count)])).join(' · '));
</script>

<template>
  <article class="card diagnosis" :data-status="diagnosis.remediated ? 'remediated' : diagnosis.status" data-testid="diagnosis">
    <div class="card-head">
      <span class="badge" :class="{ flag: diagnosis.status === 'confirmed' && !diagnosis.remediated }" data-testid="diagnosis-state">
        {{ diagnosis.remediated ? i18n.t('diag.remediated') : diagnosis.status === 'confirmed' ? i18n.t('diag.confirmed') : i18n.t('diag.suspected') }}
      </span>
    </div>
    <p data-testid="diagnosis-hypothesis">
      {{ i18n.t('diag.hypothesis', [String(diagnosis.evidence.length), diagnosis.about.join(i18n.t('diag.listSeparator')), diagnosis.concept.name]) }}
    </p>
    <p class="muted small">{{ signalText }}</p>
    <details class="evidence">
      <summary>{{ i18n.t('diag.evidence', diagnosis.evidence.length) }}</summary>
      <ul>
        <li v-for="e in diagnosis.evidence" :key="e.id" data-testid="diagnosis-evidence">
          {{ e.text }}
          <a :href="e.conversationUrl" target="_blank" rel="noopener" class="small">{{ i18n.t('diag.openConversation') }}</a>
        </li>
      </ul>
    </details>

    <template v-if="diagnosis.status === 'suspected'">
      <form v-if="quiz && !results" class="diag-quiz" @submit.prevent="checkQuiz">
        <label v-for="(item, i) in quiz" :key="i" class="field">
          <span>{{ item.question }}</span>
          <textarea v-model="answers[i]" rows="2" :aria-label="item.question" />
        </label>
        <button type="submit" data-testid="diagnosis-check" :disabled="busy">{{ busy ? i18n.t('quiz.judging') : i18n.t('diag.checkAnswers') }}</button>
      </form>
      <div v-else-if="!quiz" class="row-actions">
        <button v-if="configured" type="button" data-testid="diagnosis-quiz" :disabled="busy" @click="startQuiz">{{ i18n.t('diag.takeQuiz') }}</button>
        <button type="button" data-testid="diagnosis-accurate" :disabled="busy" @click="decide(true)">{{ i18n.t('diag.accurate') }}</button>
        <button type="button" data-testid="diagnosis-inaccurate" :disabled="busy" @click="decide(false)">{{ i18n.t('diag.inaccurate') }}</button>
      </div>
    </template>

    <ul v-if="results" class="points">
      <li v-for="(r, i) in results" :key="i" :class="`verdict-${r.verdict}`" data-testid="diagnosis-result">
        <strong>{{ i18n.t(`quiz.verdict_${r.verdict}`) }}</strong> · {{ quiz![i]!.question }}<span class="muted"> — {{ r.feedback }}</span>
      </li>
    </ul>

    <template v-if="diagnosis.status === 'confirmed' && !diagnosis.remediated && configured">
      <button v-if="!review" type="button" data-testid="diagnosis-review" :disabled="busy" @click="startReview">
        {{ busy ? i18n.t('diag.writingReview') : i18n.t('diag.review', [diagnosis.concept.name]) }}
      </button>
      <form v-else class="review" @submit.prevent="keepReview">
        <label v-for="(c, i) in review" :key="i" class="candidate">
          <input v-model="c.keep" type="checkbox">
          <span><strong>{{ c.question }}</strong><br>{{ c.summary }}</span>
        </label>
        <label class="candidate">
          <input v-model="internalize" type="checkbox" data-testid="review-internalize">
          <span>{{ i18n.t('diag.knowByHeart') }}</span>
        </label>
        <button type="submit" data-testid="review-keep" :disabled="busy || !review.some((c) => c.keep)">{{ i18n.t('diag.keepReview') }}</button>
      </form>
    </template>
  </article>
</template>
