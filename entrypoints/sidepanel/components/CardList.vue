<script setup lang="ts">
import { computed, provide, ref } from 'vue';
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { NodeView } from '@/src/db/types';
import { buildTree } from '@/src/graph/tree';
import CardTree from './CardTree.vue';
import { DRAGGING } from '../dnd';
import { useRun } from '../notify';

const props = defineProps<{ cards: NodeView[]; configured: boolean }>();
const emit = defineEmits<{ openSource: [sourceId: string] }>();
const run = useRun();

/** Explore: the question tree as it grew. Conclusion: the same tree as an outline of statements. */
const mode = ref<'explore' | 'conclusion'>('explore');
const tree = computed(() => buildTree(props.cards));
const dragging = ref<string | null>(null);
provide(DRAGGING, dragging);

async function toTopLevel() {
  const id = dragging.value;
  dragging.value = null;
  if (id) await run(() => sendMessage('nodes/move', { id, parentId: null }));
}
</script>

<template>
  <p v-if="cards.length === 0" class="empty" data-testid="empty">{{ i18n.t('panel.empty') }}</p>
  <template v-else>
    <div class="mode" role="group">
      <button type="button" class="chip" :aria-pressed="mode === 'explore'" data-testid="mode-explore" @click="mode = 'explore'">
        {{ i18n.t('tree.explore') }}
      </button>
      <button type="button" class="chip" :aria-pressed="mode === 'conclusion'" data-testid="mode-conclusion" @click="mode = 'conclusion'">
        {{ i18n.t('tree.conclusion') }}
      </button>
    </div>
    <CardTree :items="tree" :parent-id="null" :mode="mode" :configured="configured" @open-source="emit('openSource', $event)" />
    <div v-if="dragging" class="drop-root" data-testid="drop-root" @dragover.prevent @drop.prevent="toTopLevel">
      {{ i18n.t('tree.dropRoot') }}
    </div>
  </template>
</template>
