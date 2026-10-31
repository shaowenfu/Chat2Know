<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { i18n } from '#i18n';
import { isEnvelope, sendMessage, type SubjectSummary } from '@/src/messaging';
import { errorText } from '@/src/errors';
import type { MapNode } from '@/src/db/types';
import { itemCount, type MapTree } from '@/src/graph/tree';
import MapBranch from '@/src/ui/MapBranch.vue';
import ContextMenu from '@/src/ui/ContextMenu.vue';
import SiteChecklist from '@/src/ui/SiteChecklist.vue';
import { provideMap } from '@/src/ui/map-context';
import { formulaHtml } from '@/src/ui/math';

/** An item recorded this recently is marked "刚记下". */
const JUST_MS = 10 * 60_000;
const NOTICE_MS = 4000;
const EXPANDED_KEY = 'chat2know.expanded';

const subjects = ref<SubjectSummary[]>([]);
const currentId = ref<string>();
/** Until the user picks a subject here, the panel follows the subject recorded into last. */
const picked = ref(false);
const tree = ref<MapTree>();
const configured = ref(true);
const sites = ref<string[]>([]);
const error = ref('');
const notice = ref<{ text: string; group: string }>();
const menu = ref<{ node: MapNode; x: number; y: number }>();
const switching = ref(false);
const loaded = ref(false);

const expanded = ref(new Set<string>(readExpanded()));
const newestId = ref<string>();
const editingId = ref<string>();
const dragging = ref<string>();
const dropTarget = ref<string>();

function readExpanded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[];
  } catch {
    return []; // storage blocked: folds are a convenience
  }
}
function saveExpanded() {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded.value]));
  } catch {
    // storage blocked: folds are a convenience
  }
}

const current = computed(() => subjects.value.find((s) => s.id === currentId.value));
const mapUrl = computed(() => browser.runtime.getURL(`/map.html#${currentId.value ?? ''}`));
const settingsUrl = browser.runtime.getURL('/map.html#settings');

async function run(action: () => Promise<unknown>) {
  try {
    error.value = '';
    await action();
  } catch (err) {
    error.value = errorText(err);
  }
}

/** The newest item, when it was just recorded, and the path down to it. */
function newestPath(t: MapTree): MapNode[] {
  let best: MapNode[] = [];
  const walk = (n: MapTree, path: MapNode[]) => {
    if (n.node.kind === 'item') {
      if (!best.length || n.node.createdAt > best.at(-1)!.createdAt) best = [...path, n.node];
      return;
    }
    n.children.forEach((c) => walk(c, [...path, n.node]));
  };
  walk(t, []);
  return best.length && best.at(-1)!.createdAt > Date.now() - JUST_MS ? best : [];
}

async function load() {
  const [subs, settings] = await Promise.all([sendMessage('map/subjects', {}), sendMessage('settings/get', {})]);
  configured.value = Boolean(settings.baseUrl && settings.model && settings.hasKey);
  subjects.value = subs;
  loaded.value = true;
  if (!subs.length) {
    tree.value = undefined;
    sites.value = (await sendMessage('sites/get', {})).origins;
    return;
  }
  const latest = [...subs].sort((a, b) => b.latest - a.latest)[0]!;
  if (!subs.some((s) => s.id === currentId.value) || !picked.value) currentId.value = latest.id;
  tree.value = await sendMessage('map/tree', { subjectId: currentId.value! });
  const path = newestPath(tree.value);
  newestId.value = path.at(-1)?.id;
  for (const n of path.slice(1, -1)) expanded.value.add(n.id);
  for (const c of tree.value.children) if (c.node.role === 'unplaced') expanded.value.add(c.node.id);
}

function pick(id: string) {
  currentId.value = id;
  picked.value = true;
  switching.value = false;
  void run(load);
}

function showNotice(text: string, group: string) {
  notice.value = { text, group };
  setTimeout(() => {
    if (notice.value?.group === group) notice.value = undefined;
  }, NOTICE_MS);
}

provideMap({
  expanded,
  newestId,
  editingId,
  dragging,
  dropTarget,
  toggle(id) {
    if (expanded.value.has(id)) expanded.value.delete(id);
    else expanded.value.add(id);
    saveExpanded();
  },
  openItem(node) {
    if (node.source) void run(() => sendMessage('map/openSource', { itemId: node.id }));
  },
  openMenu(event, node) {
    menu.value = { node, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 160) };
  },
  drop(targetId) {
    const id = dragging.value;
    dragging.value = undefined;
    dropTarget.value = undefined;
    if (id && id !== targetId) void run(() => sendMessage('map/moveNode', { id, parentId: targetId }));
  },
  saveEdit(node, text) {
    const value = text.trim();
    const isFormula = node.kind === 'item' && node.itemType === 'formula';
    if (!value || value === (isFormula ? node.latex : node.title)) return;
    void run(() => sendMessage('map/edit', { id: node.id, ...(isFormula ? { latex: value } : { title: value }) }));
  },
});

function menuMove(targetId: string) {
  const node = menu.value!.node;
  menu.value = undefined;
  void run(() => sendMessage('map/moveNode', { id: node.id, parentId: targetId }));
}
function menuEdit() {
  editingId.value = menu.value!.node.id;
  menu.value = undefined;
}
function menuRemove() {
  const node = menu.value!.node;
  menu.value = undefined;
  void run(async () => {
    const { group } = await sendMessage('map/remove', { id: node.id });
    showNotice(i18n.t('panel.removed', [node.latex ?? node.title]), group);
  });
}
function undo(group?: string) {
  notice.value = undefined;
  void run(() => sendMessage('map/undo', group ? { group } : {}));
}

function renameSubject(title: string) {
  const node = subjectNode.value!;
  if (editingId.value !== node.id) return;
  editingId.value = undefined;
  if (title.trim() && title.trim() !== node.title) void run(() => sendMessage('map/edit', { id: node.id, title }));
}

function onKey(e: KeyboardEvent) {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    undo();
  }
}

async function importOld(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await run(async () => {
    const { nodes } = await sendMessage('map/import', { json: await file.text() });
    showNotice(i18n.t('empty.imported', [String(nodes)]), '');
  });
}

function onMessage(message: unknown) {
  if (isEnvelope(message) && message.type === 'event/dataChanged') void run(load);
}

onMounted(() => {
  void run(load);
  browser.runtime.onMessage.addListener(onMessage);
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  browser.runtime.onMessage.removeListener(onMessage);
  window.removeEventListener('keydown', onKey);
});

const subjectNode = computed(() => tree.value?.node);
</script>

<template>
  <main class="panel" data-testid="panel">
    <template v-if="loaded && !subjects.length">
      <header class="top">
        <span class="brand">{{ i18n.t('extName') }}</span>
        <a :href="settingsUrl" target="_blank" class="icon" :aria-label="i18n.t('panel.settings')" :title="i18n.t('panel.settings')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </a>
      </header>
      <div class="empty" data-testid="empty">
        <div class="intro">
          <h1>{{ i18n.t('empty.title') }}</h1>
          <p>{{ i18n.t('empty.body') }}</p>
        </div>
        <div class="demo">
          <div class="demo-formula">
            <!-- eslint-disable-next-line vue/no-v-html -- KaTeX output -->
            <span v-html="formulaHtml('\\det(AB) = \\det A \\cdot \\det B')" />
            <span class="demo-plus" aria-hidden="true">＋</span>
          </div>
          <span class="demo-text">{{ i18n.t('empty.how') }}</span>
        </div>
        <fieldset class="sites">
          <legend>{{ i18n.t('sites.legend') }}</legend>
          <SiteChecklist v-model="sites" @error="error = $event" />
          <span class="note">{{ i18n.t('sites.note') }}</span>
        </fieldset>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
      <footer class="foot split">
        <label class="link-button">
          {{ i18n.t('empty.importOld') }}
          <input type="file" accept="application/json,.json" hidden data-testid="import-old" @change="importOld">
        </label>
        <span class="muted">{{ notice?.text ?? i18n.t('empty.local') }}</span>
      </footer>
    </template>

    <template v-else-if="tree && current">
      <header class="top">
        <div class="switcher">
          <button type="button" class="subject" :aria-label="i18n.t('panel.pickSubject')" :aria-expanded="switching" @click="switching = !switching">
            {{ current.title }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <ul v-if="switching" class="subjects" role="listbox">
            <li v-for="s in subjects" :key="s.id" role="option" :aria-selected="s.id === currentId">
              <button type="button" @click="pick(s.id)">
                <span>{{ s.title }}</span><span class="muted">{{ s.items }}</span>
              </button>
            </li>
          </ul>
        </div>
        <a :href="mapUrl" target="_blank" class="expand">{{ i18n.t('panel.expand') }}</a>
      </header>

      <div v-if="!configured" class="banner" data-testid="no-model">
        <span>{{ i18n.t('panel.noModel') }}</span>
        <a :href="settingsUrl" target="_blank">{{ i18n.t('panel.setUpModel') }}</a>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section class="map" role="tree" :aria-label="current.title">
        <div
          class="chip-row"
          :class="{ target: dropTarget === subjectNode!.id }"
          @dragover.prevent="dragging && (dropTarget = subjectNode!.id)"
          @dragleave="dropTarget === subjectNode!.id && (dropTarget = undefined)"
          @drop.prevent="dropTarget === subjectNode!.id && (dragging && dragging !== subjectNode!.id) && run(() => sendMessage('map/moveNode', { id: dragging!, parentId: subjectNode!.id }))"
          @contextmenu.prevent="menu = { node: subjectNode!, x: $event.clientX, y: $event.clientY }"
        >
          <input
            v-if="editingId === subjectNode!.id"
            class="chip-edit"
            :value="subjectNode!.title"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            @keydown.esc.prevent="editingId = undefined"
            @blur="renameSubject(($event.target as HTMLInputElement).value)"
          >
          <span v-else class="chip">{{ subjectNode!.title }}</span>
          <span class="muted small">{{ i18n.t('panel.itemCount', [String(itemCount(tree))]) }}</span>
        </div>
        <MapBranch v-if="tree.children.length" :trees="tree.children" />
      </section>

      <footer class="foot">
        <template v-if="notice">
          <span>{{ notice.text }}</span>
          <button v-if="notice.group" type="button" class="link-button" @click="undo(notice.group)">{{ i18n.t('toast.undo') }}</button>
        </template>
        <span v-else class="muted">{{ configured ? i18n.t('panel.hint') : i18n.t('panel.hintNoModel') }}</span>
      </footer>
    </template>

    <ContextMenu
      v-if="menu"
      :node="menu.node"
      :x="menu.x"
      :y="menu.y"
      :subjects="subjects"
      @close="menu = undefined"
      @move="menuMove"
      @edit="menuEdit"
      @remove="menuRemove"
    />
  </main>
</template>
