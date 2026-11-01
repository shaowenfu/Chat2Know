<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import { errorText } from '@/src/errors';
import type { GapCard } from '@/src/services/gaps';
import type { Gap } from '@/src/db/types';
import { formulaHtml, textHtml } from './math';

/**
 * "你是不是不太熟悉…？" (artboards 2 and 4): what the user asked, what "整理进来" would add
 * (each can be unticked), one question to try, or "不用". Only one shows at a time.
 */
const props = defineProps<{ card: GapCard }>();
const emit = defineEmits<{ done: [] }>();

const proposal = ref<NonNullable<Gap['proposal']>>();
const skip = ref(new Set<number>());
const busy = ref(false);
const error = ref('');
const showAsks = ref(false);
const question = ref<string>();
const answer = ref('');
const verdict = ref<{ correct: boolean; feedback: string }>();

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = '';
  try {
    await action();
  } catch (err) {
    error.value = errorText(err);
  } finally {
    busy.value = false;
  }
}

const id = props.card.gap.id;
const title = props.card.path.at(-1) ?? '';

onMounted(() => run(async () => (proposal.value = await sendMessage('gaps/proposeFill', { gapId: id }))));

function toggle(i: number) {
  if (skip.value.has(i)) skip.value.delete(i);
  else skip.value.add(i);
}
const fill = () => run(async () => (await sendMessage('gaps/fill', { gapId: id, skip: [...skip.value] }), emit('done')));
const dismiss = () => run(async () => (await sendMessage('gaps/dismiss', { gapId: id }), emit('done')));
const ask = () => run(async () => (question.value = (await sendMessage('gaps/quiz', { gapId: id })).question));
const check = () =>
  run(async () => {
    verdict.value = await sendMessage('gaps/judge', { gapId: id, answer: answer.value });
  });
</script>

<template>
  <div class="gap-card" data-testid="gap-card">
    <span class="question">{{ i18n.t('gaps.question', [title]) }}</span>
    <span class="explain">{{ i18n.t('gaps.evidence', [String(card.conversations), String(card.asks.length)]) }}</span>

    <template v-if="question">
      <span class="quiz">{{ question }}</span>
      <template v-if="!verdict?.correct">
        <textarea v-model="answer" rows="2" :placeholder="i18n.t('gaps.answerPlaceholder')" data-testid="gap-answer" />
        <div class="buttons">
          <button type="button" class="primary" :disabled="busy || !answer.trim()" @click="check">{{ i18n.t('gaps.check') }}</button>
        </div>
      </template>
      <span v-if="verdict" class="verdict" :class="{ right: verdict.correct }" role="status">
        {{ verdict.correct ? i18n.t('gaps.right') : '' }} {{ verdict.feedback }}
      </span>
      <template v-if="verdict && !verdict.correct">
        <span class="explain">{{ i18n.t('gaps.addAfterWrong') }}</span>
        <div class="buttons">
          <button type="button" class="primary grow" :disabled="busy || !proposal?.length" @click="fill">{{ i18n.t('gaps.fill') }}</button>
          <button type="button" class="plain" :disabled="busy" @click="dismiss">{{ i18n.t('gaps.no') }}</button>
        </div>
      </template>
      <button v-if="verdict?.correct" type="button" class="link-button" @click="emit('done')">{{ i18n.t('picker.cancel') }}</button>
    </template>

    <template v-else>
      <div class="preview">
        <span class="label">{{ proposal ? i18n.t('gaps.preview') : i18n.t('gaps.drafting') }}</span>
        <label v-for="(p, i) in proposal" :key="i" class="proposed">
          <input type="checkbox" :checked="!skip.has(i)" @change="toggle(i)">
          <!-- eslint-disable-next-line vue/no-v-html -- KaTeX output; plain text is escaped (src/ui/math.ts) -->
          <span :class="{ mono: p.itemType === 'formula' }" v-html="p.itemType === 'formula' ? formulaHtml(p.text) : textHtml(p.text)" />
        </label>
        <span v-if="proposal && !proposal.length" class="label">{{ i18n.t('gaps.nothingNew') }}</span>
      </div>
      <div class="buttons">
        <button type="button" class="primary grow" :disabled="busy || !proposal?.length || skip.size === proposal.length" @click="fill">{{ i18n.t('gaps.fill') }}</button>
        <button type="button" class="secondary" :disabled="busy" @click="ask">{{ i18n.t('gaps.tryQuestion') }}</button>
        <button type="button" class="plain" :disabled="busy" @click="dismiss">{{ i18n.t('gaps.no') }}</button>
      </div>
      <button type="button" class="link-button small" :aria-expanded="showAsks" @click="showAsks = !showAsks">{{ i18n.t('gaps.showAsks', [String(card.asks.length)]) }}</button>
      <ul v-if="showAsks" class="asks">
        <li v-for="(a, i) in card.asks" :key="i">{{ a }}</li>
      </ul>
    </template>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.gap-card {
  padding: 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1.5px solid #b4480f;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.question {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}
.explain {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f7f7f5;
}
.label {
  font-size: 11px;
  color: var(--muted);
}
.proposed {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  color: var(--accent-ink);
}
.proposed .mono {
  font-family: var(--mono);
}
.buttons {
  display: flex;
  gap: 6px;
}
.buttons button {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
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
.primary:disabled {
  opacity: 0.5;
}
.secondary {
  border: 1px solid var(--line-strong);
  background: var(--surface);
}
.plain {
  border: 0;
  background: transparent;
  color: var(--ink-2);
}
.small {
  align-self: flex-start;
  font-size: 12px;
}
.asks {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.quiz {
  font-size: 13px;
  font-weight: 500;
}
textarea {
  font: inherit;
  font-size: 13px;
  padding: 8px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  resize: vertical;
}
.verdict {
  font-size: 12px;
  color: #8a3409;
}
.verdict.right {
  color: #2e7d4f;
}
.error {
  margin: 0;
  color: #b3261e;
  font-size: 12px;
}
</style>
