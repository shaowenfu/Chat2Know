import { inject, type ComputedRef, type InjectionKey } from 'vue';

/** How a diagnosis marks a concept's card on the map. */
export type GapState = 'suspected' | 'confirmed' | 'remediated';

export const GAPS: InjectionKey<ComputedRef<Map<string, GapState>>> = Symbol('gaps');
export const useGaps = () => inject(GAPS)!;
