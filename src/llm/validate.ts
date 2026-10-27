import { LlmError } from './client';

/** Small shape checks for model JSON. They throw so bad output surfaces instead of being patched over. */

export function obj(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new LlmError('Expected a JSON object');
  return value as Record<string, unknown>;
}

export function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || !v.trim()) throw new LlmError(`Expected non-empty string "${key}"`);
  return v.trim();
}

export function strList(o: Record<string, unknown>, key: string, length?: number): string[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.trim())) throw new LlmError(`Expected string list "${key}"`);
  if (length !== undefined && v.length !== length) throw new LlmError(`Expected ${length} items in "${key}"`);
  return v.map((x: string) => x.trim());
}

export function oneOf<T extends string>(o: Record<string, unknown>, key: string, values: readonly T[]): T {
  const v = o[key];
  if (!values.includes(v as T)) throw new LlmError(`Expected "${key}" to be one of ${values.join(', ')}`);
  return v as T;
}
