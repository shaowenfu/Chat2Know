<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';
import { UserError, errorText } from '@/src/errors';

/**
 * The model connection (settings and the first screen): base URL, model, key, and the
 * optional embedding model. Saving asks the browser for access to that one address,
 * which the note says before it happens. `compact`: one "save and test" button, the
 * embedding model folded under "advanced" (artboard 9).
 */
const props = defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ error: [message: string]; saved: [] }>();

const baseUrl = ref('');
const model = ref('');
const embeddingModel = ref('');
const apiKey = ref('');
const hasKey = ref(false);
const status = ref<'unknown' | 'connected' | 'failed'>('unknown');
const message = ref('');
const busy = ref(false);

onMounted(async () => {
  const s = await sendMessage('settings/get', {});
  [baseUrl.value, model.value, embeddingModel.value, hasKey.value] = [s.baseUrl, s.model, s.embeddingModel, s.hasKey];
});

async function save(): Promise<boolean> {
  // Host access to the model endpoint is granted for that origin only, when it is saved.
  const origin = `${new URL(baseUrl.value.trim()).origin}/*`;
  if (!(await browser.permissions.request({ origins: [origin] }))) throw new UserError('settings.permissionDenied', [origin]);
  const saved = await sendMessage('settings/save', {
    baseUrl: baseUrl.value,
    model: model.value,
    embeddingModel: embeddingModel.value,
    ...(apiKey.value.trim() ? { apiKey: apiKey.value } : {}),
  });
  apiKey.value = '';
  hasKey.value = saved.hasKey;
  status.value = 'unknown';
  message.value = i18n.t('settings.saved');
  return true;
}

async function test() {
  status.value = 'unknown';
  message.value = '';
  try {
    const { reply } = await sendMessage('settings/test', {});
    status.value = 'connected';
    message.value = i18n.t('settings.testOk', [reply]);
  } catch (err) {
    status.value = 'failed';
    emit('error', errorText(err));
  }
}

async function submit() {
  busy.value = true;
  try {
    await save();
    if (props.compact) await test();
    emit('saved');
  } catch (err) {
    emit('error', errorText(err));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="model-form" data-testid="model-settings" @submit.prevent="submit">
    <span v-if="status !== 'unknown'" :class="status === 'connected' ? 'ok' : 'bad'" class="state">
      {{ status === 'connected' ? i18n.t('settings.connected') : i18n.t('settings.notConnected') }}
    </span>
    <label class="field">
      {{ i18n.t('settings.baseUrl') }}
      <input v-model="baseUrl" type="url" required placeholder="https://api.deepseek.com" data-testid="base-url">
    </label>
    <div class="two">
      <label class="field">
        {{ i18n.t('settings.modelName') }}
        <input v-model="model" required placeholder="deepseek-chat" data-testid="model">
      </label>
      <label class="field">
        {{ i18n.t('settings.apiKey') }}
        <input v-model="apiKey" type="password" autocomplete="off" :placeholder="hasKey ? i18n.t('settings.apiKeySaved') : 'sk-…'" data-testid="api-key">
      </label>
    </div>
    <details :open="!compact" class="advanced">
      <summary>{{ i18n.t('settings.advanced') }}</summary>
      <label class="field">
        {{ i18n.t('settings.embedding') }}
        <input v-model="embeddingModel" :placeholder="i18n.t('settings.embeddingPlaceholder')" data-testid="embedding-model">
      </label>
    </details>
    <div class="buttons">
      <button type="submit" class="primary" :disabled="busy">{{ compact ? i18n.t('settings.saveAndTest') : i18n.t('settings.save') }}</button>
      <button v-if="!compact" type="button" class="secondary" @click="test">{{ i18n.t('settings.test') }}</button>
    </div>
    <span v-if="message" class="ok" role="status" data-testid="model-status">{{ message }}</span>
    <span class="note">{{ i18n.t('settings.permissionNote') }} {{ i18n.t('settings.keyNote') }}</span>
  </form>
</template>

<style scoped>
.model-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.state {
  font-size: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.field input {
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  background: var(--surface);
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.advanced summary {
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  margin-bottom: 6px;
}
.buttons {
  display: flex;
  gap: 8px;
}
.buttons button {
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.primary {
  flex: 1;
  border: 0;
  background: var(--ink);
  color: #ffffff;
  font-weight: 500;
}
.primary:disabled {
  opacity: 0.6;
}
.secondary {
  border: 1px solid var(--line-strong);
  background: var(--surface);
}
.ok {
  font-size: 12px;
  color: #2e7d4f;
}
.bad {
  font-size: 12px;
  color: #b3261e;
}
.note {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--muted);
}
</style>
