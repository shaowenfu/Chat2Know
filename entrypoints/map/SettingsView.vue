<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import { UserError, errorText } from '@/src/errors';
import SiteChecklist from '@/src/ui/SiteChecklist.vue';
import { download, stamp } from './download';

/** Settings (artboard 3): the model, the sites and question recording, the data. */
const emit = defineEmits<{ error: [message: string] }>();

const baseUrl = ref('');
const model = ref('');
const embeddingModel = ref('');
const apiKey = ref('');
const hasKey = ref(false);
const status = ref<'unknown' | 'connected' | 'failed'>('unknown');
const message = ref('');
const origins = ref<string[]>([]);
const recordAsks = ref(false);
const confirmClear = ref(false);

async function run(action: () => Promise<unknown>) {
  try {
    message.value = '';
    await action();
  } catch (err) {
    emit('error', errorText(err));
  }
}

onMounted(() =>
  run(async () => {
    const s = await sendMessage('settings/get', {});
    [baseUrl.value, model.value, embeddingModel.value, hasKey.value] = [s.baseUrl, s.model, s.embeddingModel, s.hasKey];
    const sites = await sendMessage('sites/get', {});
    [origins.value, recordAsks.value] = [sites.origins, sites.recordAsks];
  }),
);

async function save() {
  await run(async () => {
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
  });
}

async function test() {
  status.value = 'unknown';
  try {
    message.value = '';
    const { reply } = await sendMessage('settings/test', {});
    status.value = 'connected';
    message.value = i18n.t('settings.testOk', [reply]);
  } catch (err) {
    status.value = 'failed';
    emit('error', errorText(err));
  }
}

async function setRecordAsks(on: boolean) {
  await run(async () => (recordAsks.value = (await sendMessage('sites/setRecordAsks', { on })).recordAsks));
}

const FORMATS = [
  { format: 'json', ext: 'json', type: 'application/json', label: 'settings.exportJson' },
  { format: 'markdown', ext: 'md', type: 'text/markdown', label: 'settings.exportMarkdown' },
  { format: 'opml', ext: 'opml', type: 'text/x-opml', label: 'settings.exportOpml' },
] as const;

async function exportAs(f: (typeof FORMATS)[number]) {
  await run(async () => download(`chat2know-${stamp()}.${f.ext}`, await sendMessage('map/export', { format: f.format }), f.type));
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await run(async () => {
    const { nodes } = await sendMessage('map/import', { json: await file.text() });
    message.value = i18n.t('empty.imported', [String(nodes)]);
  });
  input.value = '';
}

async function clearAll() {
  if (!confirmClear.value) {
    confirmClear.value = true;
    return;
  }
  confirmClear.value = false;
  await run(async () => {
    await sendMessage('map/clear', {});
    message.value = i18n.t('settings.cleared');
  });
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-grid">
      <form class="card" data-testid="model-settings" @submit.prevent="save">
        <div class="card-head">
          <h2>{{ i18n.t('settings.model') }}</h2>
          <span v-if="status === 'connected'" class="ok">{{ i18n.t('settings.connected') }}</span>
          <span v-else-if="status === 'failed'" class="bad">{{ i18n.t('settings.notConnected') }}</span>
        </div>
        <span class="muted">{{ i18n.t('settings.modelExplain') }}</span>
        <label class="field">
          {{ i18n.t('settings.baseUrl') }}
          <input v-model="baseUrl" type="url" required placeholder="https://api.openai.com/v1" data-testid="base-url">
        </label>
        <div class="two">
          <label class="field">
            {{ i18n.t('settings.modelName') }}
            <input v-model="model" required placeholder="gpt-4o-mini" data-testid="model">
          </label>
          <label class="field">
            {{ i18n.t('settings.apiKey') }}
            <input v-model="apiKey" type="password" autocomplete="off" :placeholder="hasKey ? i18n.t('settings.apiKeySaved') : 'sk-…'" data-testid="api-key">
          </label>
        </div>
        <label class="field">
          {{ i18n.t('settings.embedding') }}
          <input v-model="embeddingModel" :placeholder="i18n.t('settings.embeddingPlaceholder')" data-testid="embedding-model">
        </label>
        <div class="buttons">
          <button type="submit" class="button primary">{{ i18n.t('settings.save') }}</button>
          <button type="button" class="button" @click="test">{{ i18n.t('settings.test') }}</button>
        </div>
        <span v-if="message" class="ok" role="status">{{ message }}</span>
        <span class="muted small">{{ i18n.t('settings.keyNote') }}</span>
      </form>

      <div class="column">
        <section class="card">
          <h2>{{ i18n.t('settings.sites') }}</h2>
          <span class="muted">{{ i18n.t('settings.sitesExplain') }}</span>
          <SiteChecklist v-model="origins" :columns="3" @error="emit('error', $event)" />
          <div class="rule" />
          <label class="check">
            <input type="checkbox" :checked="recordAsks" data-testid="record-asks" @change="setRecordAsks(($event.target as HTMLInputElement).checked)">
            <span>
              {{ i18n.t('settings.recordAsks') }}<br>
              <span class="muted small">{{ i18n.t('settings.recordAsksNote') }}</span>
            </span>
          </label>
        </section>

        <section class="card">
          <h2>{{ i18n.t('settings.data') }}</h2>
          <div class="buttons wrap">
            <button v-for="f in FORMATS" :key="f.format" type="button" class="button" @click="exportAs(f)">{{ i18n.t(f.label) }}</button>
            <label class="button">
              {{ i18n.t('settings.import') }}
              <input type="file" accept="application/json,.json" hidden data-testid="import" @change="importFile">
            </label>
          </div>
          <span class="muted small">{{ i18n.t('settings.importNote') }}</span>
          <button type="button" class="danger-link" @click="clearAll">{{ confirmClear ? i18n.t('settings.clearConfirm') : i18n.t('settings.clear') }}</button>
        </section>
      </div>
    </div>
  </div>
</template>
