import { inject, provide, type InjectionKey, type Ref } from 'vue';
import type { MapNode } from '@/src/db/types';
import type { AddingItem } from './map-editing';
import type { GapCard } from '@/src/services/gaps';

/** What every row of the map tree shares: fold state, the drag in progress, the row being edited, and the actions. */
export interface MapContext {
  expanded: Ref<Set<string>>;
  newestId: Ref<string | undefined>;
  editingId: Ref<string | undefined>;
  dragging: Ref<string | undefined>;
  dropTarget: Ref<string | undefined>;
  /** Sections marked orange (possible gaps). */
  gapMarks: Ref<Set<string>>;
  /** The side panel's one gap card, shown under its section. */
  gapCard?: Ref<GapCard | undefined>;
  gapDone?(): void;
  /** The selected node: keys act on it; on the full page its section fills the detail pane. */
  selectedId: Ref<string | undefined>;
  /** A formula or statement being typed in under a section. */
  addingTo: Ref<AddingItem | undefined>;
  toggle(id: string): void;
  select(node: MapNode): void;
  /** Back to the conversation, only through the item's ↗ button. */
  openItem(node: MapNode): void;
  saveAdd(text: string): void;
  openMenu(event: MouseEvent, node: MapNode): void;
  drop(targetId: string): void;
  saveEdit(node: MapNode, text: string): void;
  /** Double-click edits in place. */
  dblclick(node: MapNode): void;
}

const KEY: InjectionKey<MapContext> = Symbol('map');

export const provideMap = (ctx: MapContext) => provide(KEY, ctx);

export function useMap(): MapContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error('MapBranch needs provideMap');
  return ctx;
}
