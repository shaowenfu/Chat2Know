import { inject, type InjectionKey } from 'vue';

/** Asks where a freshly confirmed card should go; the panel shows the suggestions. */
export const PLACE: InjectionKey<(nodeId: string) => Promise<void>> = Symbol('place');
export const usePlace = () => inject(PLACE)!;
