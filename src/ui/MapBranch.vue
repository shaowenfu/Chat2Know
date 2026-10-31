<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { i18n } from '#i18n';
import { isGrey, itemCount, type MapTree } from '@/src/graph/tree';
import type { MapNode } from '@/src/db/types';
import { formulaHtml, textHtml } from './math';
import { useMap } from './map-context';

defineOptions({ name: 'MapBranch' });
const props = defineProps<{ trees: MapTree[]; unplaced?: boolean }>();
const map = useMap();

const editText = ref('');
const editor = ref<HTMLInputElement[]>([]);
watch(map.editingId, async (id) => {
  const node = props.trees.find((t) => t.node.id === id)?.node;
  if (!node) return;
  editText.value = node.kind === 'item' && node.itemType === 'formula' ? (node.latex ?? '') : node.title;
  await nextTick();
  editor.value[0]?.focus();
  editor.value[0]?.select();
});

const sorted = computed(() => props.trees);
const isOpen = (t: MapTree) => map.expanded.value.has(t.node.id);

function dragStart(e: DragEvent, node: MapNode) {
  map.dragging.value = node.id;
  e.dataTransfer?.setData('text/plain', node.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function dragOver(e: DragEvent, node: MapNode) {
  if (!map.dragging.value || map.dragging.value === node.id) return;
  e.preventDefault();
  map.dropTarget.value = node.id;
}
function dragLeave(node: MapNode) {
  if (map.dropTarget.value === node.id) map.dropTarget.value = undefined;
}
function dropOn(e: DragEvent, node: MapNode) {
  e.preventDefault();
  map.drop(node.id);
}
function dragEnd() {
  map.dragging.value = undefined;
  map.dropTarget.value = undefined;
}
function finishEdit(node: MapNode, save: boolean) {
  if (map.editingId.value !== node.id) return;
  if (save) map.saveEdit(node, editText.value);
  map.editingId.value = undefined;
}
</script>

<template>
  <ul class="branch" :class="{ unplaced }" role="group">
    <li v-for="t in sorted" :key="t.node.id" role="treeitem" :aria-expanded="t.node.kind === 'item' ? undefined : isOpen(t)">
      <template v-if="t.node.kind === 'item'">
        <div
          class="item"
          :class="{ newest: t.node.id === map.newestId.value, formula: t.node.itemType === 'formula', dragging: map.dragging.value === t.node.id }"
          data-testid="map-item"
          draggable="true"
          @dragstart="dragStart($event, t.node)"
          @dragend="dragEnd"
          @contextmenu.prevent="map.openMenu($event, t.node)"
        >
          <input
            v-if="map.editingId.value === t.node.id"
            ref="editor"
            v-model="editText"
            class="edit"
            :class="{ mono: t.node.itemType === 'formula' }"
            @keydown.enter.prevent="finishEdit(t.node, true)"
            @keydown.esc.prevent="finishEdit(t.node, false)"
            @blur="finishEdit(t.node, true)"
          >
          <!-- eslint-disable vue/no-v-html -- KaTeX output; plain text is escaped (src/ui/math.ts) -->
          <button
            v-else
            type="button"
            class="item-body"
            :title="t.node.source ? i18n.t('panel.openSource') : undefined"
            @click="map.openItem(t.node)"
            @dblclick="map.dblclick?.(t.node)"
            v-html="t.node.itemType === 'formula' ? formulaHtml(t.node.latex ?? '') : textHtml(t.node.title)"
          />
          <span v-if="t.node.id === map.newestId.value" class="badge">{{ i18n.t('panel.justAdded') }}</span>
          <span class="handle" aria-hidden="true">⋮⋮</span>
        </div>
      </template>
      <template v-else>
        <div
          class="row"
          :class="{
            grey: isGrey(t),
            chapter: !unplaced && t.node.kind === 'section',
            'is-unplaced': t.node.role === 'unplaced',
            target: map.dropTarget.value === t.node.id,
            selected: map.selectedId?.value === t.node.id,
          }"
          data-testid="map-section"
          draggable="true"
          @dragstart="dragStart($event, t.node)"
          @dragend="dragEnd"
          @dragover="dragOver($event, t.node)"
          @dragleave="dragLeave(t.node)"
          @drop="dropOn($event, t.node)"
          @contextmenu.prevent="t.node.role ? undefined : map.openMenu($event, t.node)"
        >
          <input
            v-if="map.editingId.value === t.node.id"
            ref="editor"
            v-model="editText"
            class="edit"
            @keydown.enter.prevent="finishEdit(t.node, true)"
            @keydown.esc.prevent="finishEdit(t.node, false)"
            @blur="finishEdit(t.node, true)"
          >
          <button
            v-else
            type="button"
            class="title"
            :class="{ bold: isOpen(t) && t.children.length }"
            @click="map.toggle(t.node.id)"
            @dblclick="t.node.role ? undefined : map.dblclick?.(t.node)"
          >
            {{ t.node.role === 'unplaced' ? i18n.t('map.unplaced') : t.node.title }}
          </button>
          <span class="count">{{
            map.dropTarget.value === t.node.id
              ? i18n.t('panel.dropHere')
              : isGrey(t)
                ? t.node.role === 'unplaced'
                  ? ''
                  : i18n.t('panel.notLearned')
                : t.node.role === 'unplaced'
                  ? i18n.t('panel.itemCount', [String(itemCount(t))])
                  : itemCount(t)
          }}</span>
        </div>
        <MapBranch v-if="isOpen(t) && t.children.length" :trees="t.children" :unplaced="t.node.role === 'unplaced'" />
      </template>
    </li>
  </ul>
</template>

<style scoped>
.branch {
  list-style: none;
  margin: 0;
  padding: 0 0 0 14px;
  border-left: 1.5px solid var(--branch);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.branch.unplaced {
  border-left: 1.5px dashed var(--orange-line);
}
li {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 2px 6px;
  margin: 0 -6px;
  border-radius: 6px;
}
.row.selected {
  background: var(--bg-soft);
}
.row.target {
  background: var(--accent-soft);
  outline: 1.5px dashed var(--accent);
}
.row.target .count {
  color: var(--accent-ink);
}
.title {
  border: 0;
  padding: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  font-weight: 400;
}
.row.chapter > .title {
  font-weight: 500;
}
.title.bold,
.row.chapter > .title.bold {
  font-weight: 700;
}
.row.grey,
.row.grey .count {
  color: var(--grey);
}
.row.grey > .title {
  font-weight: 400;
}
.row.is-unplaced > .title,
.row.is-unplaced .count {
  color: var(--orange);
  font-weight: 700;
}
.count {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  line-height: 1.5;
}
.item.newest {
  background: var(--accent-soft);
  border: 1.5px solid var(--accent);
}
.item.dragging {
  opacity: 0.5;
}
.item-body {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  overflow-x: auto;
  overflow-y: hidden;
}
.item.formula .item-body {
  font-family: var(--mono);
  white-space: nowrap;
}
.badge {
  font-size: 11px;
  color: var(--accent-ink);
  white-space: nowrap;
}
.handle {
  color: var(--grey);
  cursor: grab;
  visibility: hidden;
}
.branch.unplaced .handle,
.item:hover .handle {
  visibility: visible;
}
.edit {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 2px 6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--surface);
}
.edit.mono {
  font-family: var(--mono);
}
</style>
