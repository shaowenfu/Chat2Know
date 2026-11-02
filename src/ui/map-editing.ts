import type { Ref } from 'vue';
import { i18n } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';
import type { ItemType, MapNode } from '@/src/db/types';
import type { MapTree } from '@/src/graph/tree';

/**
 * The map's editing actions, shared by the side panel and the full page: new child,
 * new sibling, add a formula or statement, indent / outdent, delete, and the keys
 * for them (Enter, Tab, Shift+Tab, Delete, F2). Every one is an undoable write.
 */

export interface AddingItem {
  parentId: string;
  itemType: ItemType;
}

export interface MapEditingDeps {
  tree: Ref<MapTree | undefined>;
  selectedId: Ref<string | undefined>;
  editingId: Ref<string | undefined>;
  addingTo: Ref<AddingItem | undefined>;
  expanded: Ref<Set<string>>;
  run(action: () => Promise<unknown>): Promise<void>;
  reload(): Promise<void>;
  /** After a delete: the side panel offers its undo. */
  removed?(node: MapNode, group: string): void;
}

interface Located {
  t: MapTree;
  parent?: MapTree;
  index: number;
}

export function useMapEditing(d: MapEditingDeps) {
  function locate(id: string, t: MapTree | undefined = d.tree.value, parent?: MapTree, index = 0): Located | undefined {
    if (!t) return undefined;
    if (t.node.id === id) return { t, ...(parent ? { parent } : {}), index };
    for (const [i, c] of t.children.entries()) {
      const hit = locate(id, c, t, i);
      if (hit) return hit;
    }
    return undefined;
  }

  /** A new section in edit mode: under `parentId`, before `beforeId` or last. */
  async function newSection(parentId: string, beforeId?: string) {
    await d.run(async () => {
      const { id } = await sendMessage('map/addSection', { parentId, title: i18n.t('mapPage.newChildTitle'), ...(beforeId ? { beforeId } : {}) });
      d.expanded.value.add(parentId);
      await d.reload();
      d.selectedId.value = id;
      d.editingId.value = id;
    });
  }

  const newChild = (node: MapNode) => newSection(node.id);

  /** Right after the node, in the same parent (a map's sibling would be another map: a child instead). */
  function newSibling(node: MapNode) {
    const at = locate(node.id);
    if (!at?.parent) return newChild(node);
    return newSection(at.parent.node.id, at.parent.children[at.index + 1]?.node.id);
  }

  function startAdd(parentId: string, itemType: ItemType) {
    d.expanded.value.add(parentId);
    d.addingTo.value = { parentId, itemType };
  }

  async function saveAdd(text: string) {
    const adding = d.addingTo.value;
    d.addingTo.value = undefined;
    if (!adding || !text.trim()) return;
    await d.run(() => sendMessage('map/addItem', { parentId: adding.parentId, itemType: adding.itemType, text }));
  }

  /** Under the previous sibling, when that is a section. */
  async function indent(node: MapNode) {
    const at = locate(node.id);
    const prev = at?.parent?.children[at.index - 1];
    if (!prev || prev.node.kind === 'item') return;
    d.expanded.value.add(prev.node.id);
    await d.run(() => sendMessage('map/moveNode', { id: node.id, parentId: prev.node.id }));
  }

  /** Up one level, right after its parent. */
  async function outdent(node: MapNode) {
    const at = locate(node.id);
    const parent = at?.parent && locate(at.parent.node.id);
    if (!parent?.parent) return;
    const after = parent.parent.children[parent.index + 1]?.node.id;
    await d.run(() => sendMessage('map/moveNode', { id: node.id, parentId: parent.parent!.node.id, ...(after ? { beforeId: after } : {}) }));
  }

  async function remove(node: MapNode) {
    d.selectedId.value = undefined;
    await d.run(async () => {
      const { group } = await sendMessage('map/remove', { id: node.id });
      d.removed?.(node, group);
    });
  }

  /** The keys on the selected node; false when the key is not one of them (or the user is typing). */
  function onKey(e: KeyboardEvent): boolean {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    const id = d.selectedId.value;
    const node = id ? locate(id)?.t.node : undefined;
    if (typing || !node || d.editingId.value || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === 'Enter') {
      if (node.kind === 'item') startAdd(node.parentId!, node.itemType!);
      else void newSibling(node);
    } else if (e.key === 'Tab' && node.kind !== 'subject') void (e.shiftKey ? outdent(node) : indent(node));
    else if ((e.key === 'Delete' || e.key === 'Backspace') && node.kind !== 'subject') void remove(node);
    else if (e.key === 'F2') d.editingId.value = node.id;
    else return false;
    e.preventDefault();
    return true;
  }

  return { newChild, newSibling, startAdd, saveAdd, indent, outdent, remove, onKey };
}
