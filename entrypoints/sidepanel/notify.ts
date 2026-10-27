import { inject, type InjectionKey } from 'vue';

export type Notify = (text: string, error?: boolean) => void;
export const NOTIFY: InjectionKey<Notify> = Symbol('notify');

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs a user action and shows its error message, unchanged, in the panel. */
export function useRun() {
  const notify = inject(NOTIFY)!;
  return async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      return await action();
    } catch (err) {
      notify(errorText(err), true);
      return undefined;
    }
  };
}
