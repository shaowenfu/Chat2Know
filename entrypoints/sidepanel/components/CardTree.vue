<script setup lang="ts">
import { i18n } from '#i18n';
import { sendMessage } from '@/src/messaging';
import type { TreeNode } from '@/src/graph/tree';
import type { Mastery } from '@/src/db/types';
import CardItem from './CardItem.vue';
import { useDragging } from '../dnd';
import { useRun } from '../notify';

/**
 * One level of the card tree. Explore mode shows question cards and supports
 * drag and drop (onto a card: becomes its child; onto the strip above a
 * sibling: placed before it). Conclusion mode shows the statements as an outline.
 */
const props = defineProps<{
  items: TreeNode[];
  parentId: string | null;
  mode: 'explore' | 'conclusion';
  configured: boolean;
  suggestions: Map<string, Mastery>;
}>();
const emit = defineEmits<{ openSource: [sourceId: string] }>();
const dragging = useDragging();
const run = useRun();

function start(event: DragEvent, id: string) {
  event.dataTransfer!.effectAllowed = 'move';
  event.dataTransfer!.setData('text/plain', id);
  dragging.value = id;
}

async function drop(parentId: string, beforeId?: string) {
  const id = dragging.value;
  dragging.value = null;
  if (!id || id === beforeId || id === parentId) return; // dropped where it already is
  await run(() => sendMessage('nodes/move', { id, parentId, ...(beforeId ? { beforeId } : {}) }));
}
</script>

<template>
  <ul :class="mode === 'explore' ? 'cards tree' : 'outline'">
    <li v-for="item in items" :key="item.node.id">
      <template v-if="mode === 'explore'">
        <div
          v-if="parentId && dragging && dragging !== item.node.id"
          class="drop-before"
          data-testid="drop-before"
          :aria-label="i18n.t('tree.dropBefore')"
          @dragover.prevent
          @drop.prevent="drop(parentId, item.node.id)"
        />
        <div
          draggable="true"
          :class="{ dragging: dragging === item.node.id }"
          @dragstart="start($event, item.node.id)"
          @dragend="dragging = null"
          @dragover.prevent
          @drop.prevent="drop(item.node.id)"
        >
          <CardItem
            :node="item.node"
            :configured="configured"
            :suggested="suggestions.get(item.node.id)"
            @open-source="emit('openSource', $event)"
          />
        </div>
      </template>
      <span v-else class="statement" :class="{ flagged: item.node.lastVerdict === 'fail' || item.node.lastVerdict === 'partial' }" data-testid="outline-item">{{ item.node.summary ?? item.node.title }}</span>
      <CardTree
        v-if="item.children.length"
        :items="item.children"
        :parent-id="item.node.id"
        :mode="props.mode"
        :configured="configured"
        :suggestions="suggestions"
        @open-source="emit('openSource', $event)"
      />
    </li>
  </ul>
</template>
