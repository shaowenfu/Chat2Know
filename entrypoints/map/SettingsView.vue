<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { i18n } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';
import { errorText } from '@/src/errors';
import SiteChecklist from '@/src/ui/SiteChecklist.vue';
import ModelForm from '@/src/ui/ModelForm.vue';
import { EXPORT_FORMATS, download, stamp, type ExportFormat } from './download';

/** Settings (artboard 3): the model, the sites and question recording, the data. */
const emit = defineEmits<{ error: [message: string] }>();

const message = ref('');
const origins = ref<string[]>([]);
const recordAsks = ref(false);
const confirmClear = ref(false);
const askCount = ref(0);

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
    const sites = await sendMessage('sites/get', {});
    [origins.value, recordAsks.value] = [sites.origins, sites.recordAsks];
    askCount.value = (await sendMessage('asks/list', {})).length;
  }),
);

async function clearAsks() {
  await run(async () => {
    await sendMessage('asks/clear', {});
    askCount.value = 0;
    message.value = i18n.t('settings.asksCleared');
  });
}

async function setRecordAsks(on: boolean) {
  await run(async () => (recordAsks.value = (await sendMessage('sites/setRecordAsks', { on })).recordAsks));
}

async function exportAs(f: ExportFormat) {
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
      <section class="card">
        <h2>{{ i18n.t('settings.model') }}</h2>
        <span class="muted">{{ i18n.t('settings.modelExplain') }}</span>
        <ModelForm @error="emit('error', $event)" />
      </section>

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
          <button v-if="askCount" type="button" class="danger-link" data-testid="clear-asks" @click="clearAsks">{{ i18n.t('settings.clearAsks', [String(askCount)]) }}</button>
        </section>

        <section class="card">
          <h2>{{ i18n.t('settings.data') }}</h2>
          <div class="buttons wrap">
            <button v-for="f in EXPORT_FORMATS" :key="f.format" type="button" class="button" @click="exportAs(f)">{{ i18n.t(f.label) }}</button>
            <label class="button">
              {{ i18n.t('settings.import') }}
              <input type="file" accept="application/json,.json" hidden data-testid="import" @change="importFile">
            </label>
          </div>
          <span class="muted small">{{ i18n.t('settings.importNote') }}</span>
          <span v-if="message" class="ok" role="status" data-testid="data-status">{{ message }}</span>
          <button type="button" class="danger-link" @click="clearAll">{{ confirmClear ? i18n.t('settings.clearConfirm') : i18n.t('settings.clear') }}</button>
        </section>
      </div>
    </div>
  </div>
</template>
