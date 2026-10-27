import { inject, type InjectionKey, type Ref } from 'vue';

/** Id of the card being dragged, shared by the whole tree so drop zones can appear. */
export const DRAGGING: InjectionKey<Ref<string | null>> = Symbol('dragging');
export const useDragging = () => inject(DRAGGING)!;
