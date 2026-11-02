<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { i18n } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';
import { errorText } from '@/src/errors';
import GrowthAnimation from './GrowthAnimation.vue';
import LangSwitch from './LangSwitch.vue';
import ModelForm from './ModelForm.vue';
import SiteChecklist from './SiteChecklist.vue';

/** The first screen (artboard 9): what it is, then ① the model ② the sites ③ the first map. */
const emit = defineEmits<{ created: [] }>();

const origins = ref<string[]>([]);
const recordAsks = ref(true);
const title = ref('');
const error = ref('');

onMounted(async () => {
  const sites = await sendMessage('sites/get', {});
  [origins.value, recordAsks.value] = [sites.origins, sites.recordAsks];
});

async function run(action: () => Promise<unknown>) {
  try {
    error.value = '';
    await action();
  } catch (err) {
    error.value = errorText(err);
  }
}
const setRecordAsks = (on: boolean) => run(async () => (recordAsks.value = (await sendMessage('sites/setRecordAsks', { on })).recordAsks));
const create = () =>
  run(async () => {
    await sendMessage('map/addSubject', { title: title.value.trim() });
    emit('created');
  });
</script>

<template>
  <header class="top">
    <span class="brand">{{ i18n.t('extName') }}</span>
    <LangSwitch compact />
  </header>
  <div class="onboard" data-testid="empty">
    <div class="intro">
      <h1>{{ i18n.t('empty.title') }}</h1>
      <p>{{ i18n.t('empty.body') }}</p>
    </div>
    <GrowthAnimation />

    <section class="step current">
      <span class="step-title">{{ i18n.t('onboard.stepModel') }}</span>
      <ModelForm compact @error="error = $event" />
    </section>

    <section class="step">
      <span class="step-title">{{ i18n.t('onboard.stepSites') }}</span>
      <SiteChecklist v-model="origins" :columns="3" @error="error = $event" />
      <label class="check">
        <input type="checkbox" :checked="recordAsks" data-testid="record-asks" @change="setRecordAsks(($event.target as HTMLInputElement).checked)">
        <span>{{ i18n.t('onboard.recordAsks') }}</span>
      </label>
    </section>

    <section class="step">
      <span class="step-title">{{ i18n.t('onboard.stepMap') }}</span>
      <form class="create" @submit.prevent="create">
        <input v-model="title" :placeholder="i18n.t('onboard.mapPlaceholder')" data-testid="first-map-title">
        <button type="submit">{{ i18n.t('onboard.create') }}</button>
      </form>
    </section>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
  <footer class="foot">
    <span class="muted">{{ i18n.t('empty.local') }}</span>
  </footer>
</template>

<style scoped>
.onboard {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.intro {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.intro h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.4;
}
.intro p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-2);
}
.step {
  padding: 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.step.current {
  border: 1.5px solid var(--accent);
}
.step-title {
  font-size: 13px;
  font-weight: 700;
}
.check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-2);
}
.check input {
  margin-top: 4px;
}
.create {
  display: flex;
  gap: 8px;
}
.create input {
  flex: 1;
  min-width: 0;
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
}
.create button {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.error {
  margin: 0;
  color: #b3261e;
  font-size: 12px;
}
</style>
