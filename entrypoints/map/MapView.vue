<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { i18n } from '#i18n';
import { sendMessage, type SubjectSummary } from '@/src/messaging';
import { errorText } from '@/src/errors';
import type { ItemType, MapNode } from '@/src/db/types';
import { withoutGrey, type MapTree } from '@/src/graph/tree';
import MapBranch from '@/src/ui/MapBranch.vue';
import ContextMenu from '@/src/ui/ContextMenu.vue';
import { provideMap } from '@/src/ui/map-context';
import { formulaHtml, textHtml } from '@/src/ui/math';

/** The full-page map: the subject's outline tree and, for the selected section, its items. */
const props = defineProps<{ subjectId?: string; subjects: SubjectSummary[]; version: number; showGrey: boolean }>();
const emit = defineEmits<{ error: [message: string] }>();

const tree = ref<MapTree>();
const expanded = ref(new Set<string>());
const selectedId = ref<string>();
const editingId = ref<string>();
const dragging = ref<string>();
const dropTarget = ref<string>();
const menu = ref<{ node: MapNode; x: number; y: number }>();
const addType = ref<ItemType>('formula');
const addText = ref('');

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (err) {
    emit('error', errorText(err));
  }
}

async function load() {
  if (!props.subjectId) {
    tree.value = undefined;
    return;
  }
  const t = await sendMessage('map/tree', { subjectId: props.subjectId });
  if (tree.value?.node.id !== t.node.id) {
    // A subject opens with its chapters unfolded.
    expanded.value = new Set(t.children.map((c) => c.node.id));
    selectedId.value = undefined;
  }
  tree.value = t;
}
watch(() => [props.subjectId, props.version], () => void run(load), { immediate: true });

const shown = computed(() => (tree.value ? (props.showGrey ? tree.value.children : withoutGrey(tree.value.children)) : []));

function find(t: MapTree | undefined, id: string | undefined, path: MapNode[] = []): { t: MapTree; path: MapNode[] } | undefined {
  if (!t || !id) return undefined;
  if (t.node.id === id) return { t, path };
  for (const c of t.children) {
    const hit = find(c, id, [...path, t.node]);
    if (hit) return hit;
  }
  return undefined;
}
const selected = computed(() => find(tree.value, selectedId.value));
const selectedItems = computed(() => selected.value?.t.children.filter((c) => c.node.kind === 'item').map((c) => c.node) ?? []);

const dateOf = (at: number) => new Date(at).toLocaleDateString(i18n.t('mapPage.dateLocale'), { month: 'short', day: 'numeric' });

provideMap({
  expanded,
  newestId: ref<string>(),
  editingId,
  dragging,
  dropTarget,
  selectedId,
  toggle(id) {
    if (selectedId.value === id && expanded.value.has(id)) expanded.value.delete(id);
    else expanded.value.add(id);
    selectedId.value = id;
  },
  openItem(node) {
    selectedId.value = node.parentId;
  },
  openMenu(event, node) {
    menu.value = { node, x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 180) };
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
  dblclick(node) {
    editingId.value = node.id;
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
  void run(() => sendMessage('map/remove', { id: node.id }));
}
function menuAddChild() {
  const parent = menu.value!.node;
  menu.value = undefined;
  void run(async () => {
    const { id } = await sendMessage('map/addSection', { parentId: parent.id, title: i18n.t('mapPage.newChildTitle') });
    expanded.value.add(parent.id);
    await load();
    editingId.value = id;
  });
}

function saveSubject(title: string) {
  if (tree.value && title.trim() && title.trim() !== tree.value.node.title) void run(() => sendMessage('map/edit', { id: tree.value!.node.id, title }));
}

async function addItem() {
  const text = addText.value.trim();
  if (!text || !selected.value) return;
  await run(async () => {
    await sendMessage('map/addItem', { parentId: selected.value!.t.node.id, itemType: addType.value, text });
    addText.value = '';
  });
}

function onKey(e: KeyboardEvent) {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    void run(() => sendMessage('map/undo', {}));
  }
  if (e.key === 'Delete' && selected.value && selected.value.t.node.kind === 'section') {
    const id = selected.value.t.node.id;
    selectedId.value = undefined;
    void run(() => sendMessage('map/remove', { id }));
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="body">
    <main class="canvas">
      <div class="legend" aria-hidden="true">
        <span><i class="swatch user" />{{ i18n.t('mapPage.legendUser') }}</span>
        <span><i class="swatch plugin" />{{ i18n.t('mapPage.legendPlugin') }}</span>
        <span><i class="swatch outline" />{{ i18n.t('mapPage.legendOutline') }}</span>
        <span><i class="swatch gap" />{{ i18n.t('mapPage.legendGap') }}</span>
      </div>
      <section v-if="tree" class="tree" role="tree" :aria-label="tree.node.title" data-testid="full-map">
        <div class="chip-row" @contextmenu.prevent="menu = { node: tree.node, x: $event.clientX, y: $event.clientY }">
          <input
            v-if="editingId === tree.node.id"
            class="chip-edit"
            :value="tree.node.title"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            @keydown.esc.prevent="editingId = undefined"
            @blur="
              editingId = undefined;
              saveSubject(($event.target as HTMLInputElement).value);
            "
          >
          <span v-else class="chip" @dblclick="editingId = tree.node.id">{{ tree.node.title }}</span>
        </div>
        <MapBranch v-if="shown.length" :trees="shown" />
      </section>
      <p v-else class="empty">{{ i18n.t('mapPage.empty') }}</p>
    </main>

    <aside class="detail" data-testid="detail">
      <template v-if="selected && selected.t.node.kind !== 'item'">
        <span class="crumbs">{{ selected.path.map((n) => n.title).join(' › ') }}</span>
        <h2>{{ selected.t.node.role ? i18n.t('map.unplaced') : selected.t.node.title }}</h2>
        <ul class="items">
          <li v-for="item in selectedItems" :key="item.id" class="entry" :class="{ plugin: item.origin === 'plugin' }">
            <!-- eslint-disable-next-line vue/no-v-html -- KaTeX output; plain text is escaped (src/ui/math.ts) -->
            <span class="entry-body" :class="{ formula: item.itemType === 'formula' }" v-html="item.itemType === 'formula' ? formulaHtml(item.latex ?? '') : textHtml(item.title)" />
            <button v-if="item.source" type="button" class="link-button source" @click="run(() => sendMessage('map/openSource', { itemId: item.id }))">
              {{ i18n.t('mapPage.fromConversation', [dateOf(item.source.capturedAt)]) }}
            </button>
            <span v-else class="muted small">{{ i18n.t('mapPage.noSource') }}</span>
          </li>
        </ul>
        <form v-if="!selected.t.node.role" class="add" @submit.prevent="addItem">
          <div class="add-type" role="radiogroup">
            <label><input v-model="addType" type="radio" value="formula"> {{ i18n.t('mapPage.addFormula') }}</label>
            <label><input v-model="addType" type="radio" value="statement"> {{ i18n.t('mapPage.addStatement') }}</label>
          </div>
          <div class="add-row">
            <input
              v-model="addText"
              :class="{ mono: addType === 'formula' }"
              :placeholder="addType === 'formula' ? i18n.t('mapPage.addPlaceholderFormula') : i18n.t('mapPage.addPlaceholderStatement')"
            >
            <button type="submit" class="button">{{ i18n.t('mapPage.add') }}</button>
          </div>
        </form>
      </template>
      <p v-else class="muted">{{ i18n.t('mapPage.pickTopic') }}</p>
      <div class="grow" />
      <span class="muted small">{{ i18n.t('mapPage.hint') }}</span>
    </aside>

    <ContextMenu
      v-if="menu"
      :node="menu.node"
      :x="menu.x"
      :y="menu.y"
      :subjects="subjects"
      can-add-child
      @close="menu = undefined"
      @move="menuMove"
      @edit="menuEdit"
      @remove="menuRemove"
      @add-child="menuAddChild"
    />
  </div>
</template>
