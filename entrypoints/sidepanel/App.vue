<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage, type PageInfo } from '@/src/messaging';

type Status = 'connecting' | 'connected' | 'disconnected';

const status = ref<Status>('connecting');
const probing = ref(false);
const page = ref<PageInfo | null>(null);
const probeError = ref<string | null>(null);

const statusLabel = (s: Status) =>
  s === 'connected' ? i18n.t('panel.connected') : s === 'connecting' ? i18n.t('panel.connecting') : i18n.t('panel.disconnected');

onMounted(async () => {
  try {
    await sendMessage('ping', { from: 'sidepanel' });
    status.value = 'connected';
  } catch {
    status.value = 'disconnected';
  }
});

async function probe() {
  probing.value = true;
  probeError.value = null;
  try {
    page.value = await sendMessage('page/probe', {});
  } catch (err) {
    page.value = null;
    probeError.value = err instanceof Error ? err.message : String(err);
  } finally {
    probing.value = false;
  }
}
</script>

<template>
  <main class="panel">
    <header>
      <h1>Chat2Know</h1>
      <p class="tagline">{{ i18n.t('panel.tagline') }}</p>
    </header>

    <section class="row">
      <span>{{ i18n.t('panel.backgroundStatus') }}</span>
      <span class="status" :data-status="status" data-testid="bg-status">{{ statusLabel(status) }}</span>
    </section>

    <button type="button" :disabled="probing" data-testid="probe" @click="probe">
      {{ probing ? i18n.t('panel.probing') : i18n.t('panel.probePage') }}
    </button>

    <section v-if="page" class="card" data-testid="probe-result">
      <div class="label">{{ i18n.t('panel.probeResult') }}</div>
      <div class="title">{{ page.title || page.url }}</div>
      <div class="meta">{{ page.url }}</div>
    </section>
    <p v-if="probeError" class="error" data-testid="probe-error">{{ i18n.t('panel.probeFailed', [probeError]) }}</p>
  </main>
</template>
