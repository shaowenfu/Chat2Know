<script setup lang="ts">
import { inject, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import { UserError } from '@/src/errors';
import type { PublicSettings } from '@/src/llm/settings';
import { NOTIFY, useRun } from '../notify';

const props = defineProps<{ settings: PublicSettings }>();
const notify = inject(NOTIFY)!;
const run = useRun();

const baseUrl = ref(props.settings.baseUrl);
const model = ref(props.settings.model);
const embeddingModel = ref(props.settings.embeddingModel);
const apiKey = ref('');
const testing = ref(false);

async function save() {
  await run(async () => {
    // Host access to the model endpoint is granted per origin, at the moment it is needed.
    const origin = `${new URL(baseUrl.value.trim()).origin}/*`;
    if (!(await browser.permissions.request({ origins: [origin] }))) throw new UserError('settings.permissionDenied', [origin]);
    await sendMessage('settings/save', {
      baseUrl: baseUrl.value,
      model: model.value,
      embeddingModel: embeddingModel.value,
      ...(apiKey.value.trim() ? { apiKey: apiKey.value } : {}),
    });
    apiKey.value = '';
    notify(i18n.t('settings.saved'));
  });
}

async function test() {
  testing.value = true;
  const res = await run(() => sendMessage('settings/test', {}));
  testing.value = false;
  if (res) notify(i18n.t('settings.testOk', [res.reply]));
}
</script>

<template>
  <form class="settings" data-testid="settings" @submit.prevent="save">
    <h2>{{ i18n.t('settings.title') }}</h2>
    <p class="muted">{{ i18n.t('settings.explain') }}</p>
    <label class="field">
      <span>{{ i18n.t('settings.baseUrl') }}</span>
      <input v-model="baseUrl" type="url" required placeholder="https://api.openai.com/v1">
    </label>
    <label class="field">
      <span>{{ i18n.t('settings.model') }}</span>
      <input v-model="model" type="text" required placeholder="gpt-4o-mini">
    </label>
    <label class="field">
      <span>{{ i18n.t('settings.apiKey') }}</span>
      <input
        v-model="apiKey"
        type="password"
        autocomplete="off"
        :required="!settings.hasKey"
        :placeholder="settings.hasKey ? i18n.t('settings.keyStored') : 'sk-…'"
      >
    </label>
    <label class="field">
      <span>{{ i18n.t('settings.embeddingModel') }}</span>
      <input v-model="embeddingModel" type="text" placeholder="text-embedding-3-small">
      <small class="muted">{{ i18n.t('settings.embeddingHint') }}</small>
    </label>
    <div class="row-actions">
      <button type="submit" data-testid="settings-save">{{ i18n.t('settings.save') }}</button>
      <button type="button" data-testid="settings-test" :disabled="testing || !settings.hasKey" @click="test">
        {{ testing ? i18n.t('settings.testing') : i18n.t('settings.test') }}
      </button>
    </div>
    <p class="muted small">{{ i18n.t('settings.privacy') }}</p>
  </form>
</template>
