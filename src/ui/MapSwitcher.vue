<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { i18n } from '@/src/i18n';
import type { SubjectSummary } from '@/src/messaging';

/**
 * The maps the user has, the one open, and "＋ 新建" (artboard 11). Only the user
 * opens or creates a map; the extension records into the open one.
 */
const props = defineProps<{ subjects: SubjectSummary[]; startOpen?: boolean }>();
const emit = defineEmits<{ open: [id: string]; create: [title: string] }>();

const expanded = ref(props.startOpen ?? false);
const title = ref('');
const input = ref<HTMLInputElement>();
const current = () => props.subjects.find((s) => s.open);
const name = (s: SubjectSummary) => s.title || i18n.t('map.unnamed');

async function toggle() {
  expanded.value = !expanded.value;
  await nextTick();
  if (expanded.value) input.value?.focus();
}
function open(id: string) {
  expanded.value = false;
  emit('open', id);
}
function create() {
  expanded.value = false;
  emit('create', title.value.trim());
  title.value = '';
}
</script>

<template>
  <div class="switcher">
    <button type="button" class="subject" data-testid="map-switcher" :aria-label="i18n.t('panel.pickSubject')" :aria-expanded="expanded" @click="toggle">
      {{ current() ? name(current()!) : i18n.t('panel.noMapOpen') }}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path :d="expanded ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'" /></svg>
    </button>
    <div v-if="expanded" class="menu" data-testid="map-menu">
      <span class="hint">{{ i18n.t('panel.mapsHint') }}</span>
      <ul role="listbox" :aria-label="i18n.t('panel.pickSubject')">
        <li v-for="s in subjects" :key="s.id" role="option" :aria-selected="s.open">
          <button type="button" :class="{ on: s.open }" @click="open(s.id)">
            <span :class="{ unnamed: !s.title }">{{ s.open ? '✓ ' : '' }}{{ name(s) }}</span>
            <span class="count">{{ s.items === 1 ? i18n.t('panel.itemCountOne') : i18n.t('panel.itemCount', [String(s.items)]) }}</span>
          </button>
        </li>
      </ul>
      <form class="create" @submit.prevent="create">
        <input ref="input" v-model="title" :placeholder="i18n.t('mapPage.newSubjectPlaceholder')" data-testid="new-map-title">
        <button type="submit">{{ i18n.t('panel.createMap') }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.switcher {
  position: relative;
}
.subject {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  padding: 0;
  background: transparent;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.menu {
  position: absolute;
  z-index: 5;
  top: 32px;
  left: -8px;
  width: 300px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hint {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--muted);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}
li button:hover {
  background: var(--bg-soft);
}
li button.on {
  background: var(--accent-soft);
  font-weight: 700;
}
.unnamed {
  color: var(--muted);
}
.count {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
.create {
  display: flex;
  gap: 6px;
  padding: 6px;
  margin-top: 4px;
  border-top: 1px solid var(--line);
}
.create input {
  flex: 1;
  min-width: 0;
  height: 32px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
}
.create button {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
}
</style>
