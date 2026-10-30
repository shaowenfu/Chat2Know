<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { QuizItem, Review, Verdict } from '@/src/db/types';
import { useRun } from '../notify';

/**
 * Quiz me: one due card at a time. Recall: answer from memory, then grade yourself
 * or let the model judge. Apply: solve a problem the model writes, judged by the model.
 */
const props = defineProps<{ due: QuizItem[]; configured: boolean; stats: { masteredThisWeek: number; due: number; mustKnow: number } }>();
const run = useRun();

const answer = ref('');
const revealed = ref(false);
const result = ref<Review | null>(null);
const busy = ref(false);
const current = computed(() => props.due[0]);

const problem = ref<string | null>(null);

watch(
  () => current.value?.id,
  async () => {
    answer.value = '';
    revealed.value = false;
    problem.value = null;
    const item = current.value;
    if (item?.mode !== 'apply') return;
    const res = await run(() => sendMessage('quiz/problem', { nodeId: item.id }));
    if (res && current.value?.id === item.id) problem.value = res.problem;
  },
  { immediate: true },
);

async function grade(verdict: Verdict) {
  const node = current.value!;
  result.value = (await run(() => sendMessage('quiz/grade', { nodeId: node.id, answer: answer.value, verdict }))) ?? null;
}

async function askModel() {
  const node = current.value!;
  busy.value = true;
  const payload = { nodeId: node.id, answer: answer.value, ...(problem.value ? { problem: problem.value } : {}) };
  result.value = (await run(() => sendMessage('quiz/judge', payload))) ?? null;
  busy.value = false;
  revealed.value = true;
}

const verdictLabel = (v: Verdict) => i18n.t(`quiz.verdict_${v}`);
</script>

<template>
  <section class="stats" data-testid="stats">
    <div>
      <strong data-testid="stat-north-star">{{ stats.masteredThisWeek }}</strong>
      <span>{{ i18n.t('quiz.masteredThisWeek') }}</span>
    </div>
    <div>
      <strong>{{ stats.due }}</strong>
      <span>{{ i18n.t('quiz.dueNow') }}</span>
    </div>
    <div>
      <strong>{{ stats.mustKnow }}</strong>
      <span>{{ i18n.t('quiz.mustKnow') }}</span>
    </div>
  </section>

  <p v-if="result" class="notice" :class="`verdict-${result.verdict}`" data-testid="quiz-result">
    {{ verdictLabel(result.verdict) }}<template v-if="result.feedback"> · {{ result.feedback }}</template>
  </p>

  <p v-if="!current" class="empty" data-testid="quiz-empty">{{ stats.mustKnow ? i18n.t('quiz.allDone') : i18n.t('quiz.noneMarked') }}</p>

  <article v-else class="card quiz" data-testid="quiz-card">
    <template v-if="current.mode === 'apply'">
      <span class="muted small">{{ i18n.t('quiz.useIt', [current.title]) }}</span>
      <p v-if="problem" class="problem" data-testid="quiz-problem">{{ problem }}</p>
      <p v-else class="muted" data-testid="quiz-problem-loading">{{ i18n.t('quiz.writingProblem') }}</p>
      <textarea v-model="answer" rows="5" :placeholder="i18n.t('quiz.solvePlaceholder')" :aria-label="i18n.t('quiz.solvePlaceholder')" />
      <div v-if="!revealed" class="row-actions">
        <button type="button" data-testid="quiz-judge" :disabled="busy || !problem || !answer.trim()" @click="askModel">
          {{ busy ? i18n.t('quiz.judging') : i18n.t('quiz.judge') }}
        </button>
      </div>
      <p v-else class="answer" data-testid="quiz-expected">{{ current.summary ?? current.body }}</p>
    </template>
    <template v-else>
      <div class="title" data-testid="quiz-question">{{ current.title }}</div>
      <textarea v-model="answer" rows="4" :placeholder="i18n.t('quiz.answerPlaceholder')" :aria-label="i18n.t('quiz.answerPlaceholder')" />
      <div v-if="!revealed" class="row-actions">
        <button type="button" data-testid="quiz-reveal" @click="revealed = true; result = null">{{ i18n.t('quiz.reveal') }}</button>
        <button v-if="configured" type="button" data-testid="quiz-judge" :disabled="busy || !answer.trim()" @click="askModel">
          {{ busy ? i18n.t('quiz.judging') : i18n.t('quiz.judge') }}
        </button>
      </div>
      <template v-else-if="!result">
        <p class="answer" data-testid="quiz-expected">{{ current.summary ?? current.body }}</p>
        <div class="row-actions">
          <span class="muted">{{ i18n.t('quiz.howDidYouDo') }}</span>
          <button type="button" data-testid="quiz-fail" @click="grade('fail')">{{ verdictLabel('fail') }}</button>
          <button type="button" data-testid="quiz-partial" @click="grade('partial')">{{ verdictLabel('partial') }}</button>
          <button type="button" data-testid="quiz-pass" @click="grade('pass')">{{ verdictLabel('pass') }}</button>
        </div>
      </template>
    </template>
  </article>
</template>
