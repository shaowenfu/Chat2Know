import { inject, provide, type InjectionKey, type Ref } from 'vue';
import type { MapNode } from '@/src/db/types';

/** What every row of the map tree shares: fold state, the drag in progress, the row being edited, and the actions. */
export interface MapContext {
  expanded: Ref<Set<string>>;
  newestId: Ref<string | undefined>;
  editingId: Ref<string | undefined>;
  dragging: Ref<string | undefined>;
  dropTarget: Ref<string | undefined>;
  /** The full page's selected section (its detail pane); the side panel has none. */
  selectedId?: Ref<string | undefined>;
  toggle(id: string): void;
  openItem(node: MapNode): void;
  openMenu(event: MouseEvent, node: MapNode): void;
  drop(targetId: string): void;
  saveEdit(node: MapNode, text: string): void;
  /** Double-click: the full page edits in place. */
  dblclick?(node: MapNode): void;
}

const KEY: InjectionKey<MapContext> = Symbol('map');

export const provideMap = (ctx: MapContext) => provide(KEY, ctx);

export function useMap(): MapContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error('MapBranch needs provideMap');
  return ctx;
}
