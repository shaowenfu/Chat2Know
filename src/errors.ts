import { i18n } from '#i18n';

/**
 * An expected failure the user can act on (nothing selected, model not set
 * up, empty title…). It carries an i18n key so the message is translated
 * where it is shown; it crosses the messaging boundary intact.
 * Unexpected failures stay plain `Error`s with diagnostic English text, and
 * provider errors are shown as the provider wrote them.
 */
export class UserError extends Error {
  override name = 'UserError';

  constructor(
    readonly key: string,
    readonly subs: string[] = [],
  ) {
    super(key);
  }
}

type Translate = (key: string, subs: string[]) => string;

/** The text to show for any error: translated for UserError, verbatim otherwise. */
export function errorText(err: unknown): string {
  if (err instanceof UserError) return (i18n.t as unknown as Translate)(err.key, err.subs);
  return err instanceof Error ? err.message : String(err);
}
