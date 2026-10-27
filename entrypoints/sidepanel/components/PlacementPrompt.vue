<script setup lang="ts">
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { Placement } from '@/src/services/placement';
import { useRun } from '../notify';

/** Where should the card just kept go? Offers the closest cards as parents, or a merge with a near-duplicate. */
const props = defineProps<{ nodeId: string; title: string; placement: Placement }>();
const emit = defineEmits<{ done: [] }>();
const run = useRun();

async function moveUnder(parentId: string) {
  await run(() => sendMessage('nodes/move', { id: props.nodeId, parentId }));
  emit('done');
}

async function merge(targetId: string) {
  await run(() => sendMessage('nodes/merge', { duplicateId: props.nodeId, targetId }));
  emit('done');
}
</script>

<template>
  <section class="place" data-testid="placement">
    <p class="place-title">{{ i18n.t('place.title', [title]) }}</p>
    <div v-if="placement.duplicate" class="row-actions" data-testid="placement-duplicate">
      <span>{{ i18n.t('place.duplicate', [placement.duplicate.title]) }}</span>
      <button type="button" data-testid="placement-merge" @click="merge(placement.duplicate.id)">{{ i18n.t('place.merge') }}</button>
    </div>
    <div v-if="placement.parents.length" class="place-options">
      <span class="muted small">{{ i18n.t('place.under') }}</span>
      <button
        v-for="p in placement.parents"
        :key="p.id"
        type="button"
        class="chip"
        data-testid="placement-parent"
        @click="moveUnder(p.id)"
      >
        {{ p.title }}
      </button>
    </div>
    <button type="button" class="link" data-testid="placement-skip" @click="emit('done')">{{ i18n.t('place.skip') }}</button>
  </section>
</template>
