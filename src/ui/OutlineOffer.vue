<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { i18n } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';
import { errorText } from '@/src/errors';
import { itemCount, type MapTree, type OutlineNode } from '@/src/graph/tree';

/**
 * "要我铺上这门课的大纲吗？" (artboard 5): asked once per subject, with a preview of the
 * outline. Sections the user already has show black with their item counts.
 */
const props = defineProps<{ tree: MapTree; outline?: OutlineNode[] }>();
const emit = defineEmits<{ done: [] }>();

const proposal = ref<OutlineNode[] | undefined>(props.outline);
const busy = ref(false);
const error = ref('');
const pasting = ref(false);
const toc = ref('');

/** The user's sections by title, with how many items each holds. */
const known = computed(() => {
  const map = new Map<string, number>();
  const walk = (t: MapTree) => {
    for (const c of t.children) {
      if (c.node.kind !== 'section' || c.node.role) continue;
      map.set(c.node.title.trim().toLowerCase(), itemCount(c));
      walk(c);
    }
  };
  walk(props.tree);
  return map;
});
const countOf = (title: string) => known.value.get(title.trim().toLowerCase());
const flat = computed(() => {
  const rows: { title: string; depth: number }[] = [];
  const walk = (nodes: OutlineNode[], depth: number) => nodes.forEach((n) => (rows.push({ title: n.title, depth }), walk(n.children, depth + 1)));
  walk(proposal.value ?? [], 0);
  return rows;
});

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = '';
  try {
    await action();
  } catch (err) {
    error.value = errorText(err);
  } finally {
    busy.value = false;
  }
}

const propose = (text?: string) =>
  run(async () => {
    proposal.value = await sendMessage('outline/propose', { subjectId: props.tree.node.id, ...(text ? { toc: text } : {}) });
    pasting.value = false;
  });
const apply = () => run(async () => (await sendMessage('outline/apply', { subjectId: props.tree.node.id }), emit('done')));
const decline = () => run(async () => (await sendMessage('outline/decline', { subjectId: props.tree.node.id }), emit('done')));

onMounted(() => {
  if (!proposal.value) void propose();
});
</script>

<template>
  <div class="offer-wrap" data-testid="outline-offer">
    <div class="offer">
      <span class="question">
        {{ itemCount(tree) === 1 ? i18n.t('outline.askFirst', [tree.node.title]) : i18n.t('outline.ask', [tree.node.title]) }}
      </span>
      <span class="explain">{{ i18n.t('outline.explain') }}</span>
      <template v-if="pasting">
        <textarea v-model="toc" rows="8" :placeholder="i18n.t('outline.tocPlaceholder')" data-testid="toc" />
        <div class="buttons">
          <button type="button" class="primary" :disabled="busy || !toc.trim()" @click="propose(toc)">{{ i18n.t('outline.fromToc') }}</button>
          <button type="button" class="plain" @click="pasting = false">{{ i18n.t('picker.cancel') }}</button>
        </div>
      </template>
      <div v-else class="buttons">
        <button type="button" class="primary grow" :disabled="busy || !proposal" @click="apply">{{ i18n.t('outline.lay') }}</button>
        <button type="button" class="secondary grow" :disabled="busy" @click="pasting = true">{{ i18n.t('outline.myBook') }}</button>
        <button type="button" class="plain" :disabled="busy" @click="decline">{{ i18n.t('outline.no') }}</button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>

    <div class="preview">
      <span class="label">{{ busy && !proposal ? i18n.t('outline.generating') : i18n.t('outline.preview') }}</span>
      <div><span class="chip">{{ tree.node.title }}</span></div>
      <ul v-if="proposal" class="rows">
        <li v-for="(r, i) in flat" :key="i" :style="{ paddingLeft: `${4 + r.depth * 16}px` }" :class="{ known: countOf(r.title) !== undefined }">
          {{ r.title }}<span v-if="countOf(r.title)" class="count">{{ countOf(r.title) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.offer-wrap {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.offer {
  padding: 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1.5px solid var(--accent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.question {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}
.explain {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}
.buttons {
  display: flex;
  gap: 6px;
}
.buttons button {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.grow {
  flex: 1;
}
.primary {
  border: 0;
  background: var(--accent);
  color: #ffffff;
  font-weight: 500;
}
.primary:disabled {
  opacity: 0.5;
}
.secondary {
  border: 1px solid var(--line-strong);
  background: var(--surface);
}
.plain {
  border: 0;
  background: transparent;
  color: var(--ink-2);
}
textarea {
  font: inherit;
  font-size: 12px;
  padding: 8px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  resize: vertical;
}
.error {
  margin: 0;
  color: #b3261e;
  font-size: 12px;
}
.preview {
  padding-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.label {
  font-size: 11px;
  color: var(--muted);
}
.chip {
  padding: 4px 12px;
  border-radius: 14px;
  background: var(--ink);
  color: #ffffff;
  font-weight: 700;
}
.rows {
  list-style: none;
  margin: 0 0 0 4px;
  padding: 0 0 0 10px;
  border-left: 1.5px solid var(--branch);
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--grey);
}
.rows .known {
  color: var(--ink);
  font-weight: 700;
}
.count {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
</style>
