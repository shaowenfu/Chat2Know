<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { i18n } from '#i18n';
import { sendMessage, type SubjectSummary } from '@/src/messaging';
import type { MapNode } from '@/src/db/types';
import type { Place } from '@/src/services/relocate';

/** Right-click menu of a map row: 移到… (search a place inline), 编辑, 删除. No dialogs. */
const props = defineProps<{ node: MapNode; x: number; y: number; subjects: SubjectSummary[]; canAddChild?: boolean }>();
const emit = defineEmits<{ close: []; move: [targetId: string]; edit: []; remove: []; addChild: [] }>();

const root = ref<HTMLElement>();
const moving = ref(false);
const query = ref('');
const places = ref<Place[]>([]);
const input = ref<HTMLInputElement>();

/** With no query: the subjects themselves (a chapter's top level). */
const subjectPlaces = () => props.subjects.map((s) => ({ id: s.id, path: [s.title] }));

async function startMove() {
  moving.value = true;
  places.value = subjectPlaces();
  await nextTick();
  input.value?.focus();
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    places.value = q.trim() ? (await sendMessage('map/searchPlaces', { query: q })).filter((p) => p.id !== props.node.id) : subjectPlaces();
  }, 150);
});

const onOutside = (e: MouseEvent) => {
  if (!root.value?.contains(e.target as Node)) emit('close');
};
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close');
onMounted(() => {
  document.addEventListener('mousedown', onOutside);
  document.addEventListener('keydown', onKey);
  root.value?.querySelector<HTMLElement>('button')?.focus();
});
onUnmounted(() => {
  document.removeEventListener('mousedown', onOutside);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="menu" role="menu" :style="{ left: `${x}px`, top: `${y}px` }" data-testid="context-menu">
    <template v-if="!moving">
      <button v-if="node.kind !== 'subject'" type="button" role="menuitem" @click="startMove">{{ i18n.t('panel.moveTo') }}</button>
      <button v-if="canAddChild && node.kind !== 'item'" type="button" role="menuitem" @click="emit('addChild')">{{ i18n.t('mapPage.newChild') }}</button>
      <button type="button" role="menuitem" @click="emit('edit')">{{ i18n.t('panel.edit') }}</button>
      <button type="button" role="menuitem" class="danger" @click="emit('remove')">{{ i18n.t('panel.remove') }}</button>
    </template>
    <template v-else>
      <input ref="input" v-model="query" class="search" :placeholder="i18n.t('picker.searchPlaceholder')">
      <button v-for="p in places" :key="p.id" type="button" role="menuitem" class="place" @click="emit('move', p.id)">
        {{ p.path.join(' › ') }}
      </button>
      <p v-if="!places.length" class="empty">{{ i18n.t('picker.noMatch') }}</p>
    </template>
  </div>
</template>

<style scoped>
.menu {
  position: fixed;
  z-index: 10;
  min-width: 160px;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}
button {
  border: 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: none;
  text-align: left;
  cursor: pointer;
}
button:hover,
button:focus-visible {
  background: var(--bg-soft);
  outline: none;
}
.danger {
  color: #b3261e;
}
.search {
  margin: 4px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  font: inherit;
}
.place {
  font-size: 12px;
}
.empty {
  margin: 6px 10px;
  color: var(--muted);
  font-size: 12px;
}
</style>
