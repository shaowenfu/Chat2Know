import { inputText, type SiteConfig } from './sites';

/**
 * Records the questions the user sends on an AI site (learning diagnosis, D1).
 *
 * On a configured site, Enter in its input or a click on its send button; on any
 * other site, Enter in a textarea / contenteditable or a click on a button next
 * to one. The text is read at that moment, before the site clears the box, and
 * reported only once the box is cleared or changed: that is the sign the site
 * really sent it (Enter while an answer is still streaming, or a toolbar button,
 * leaves the text in place). `input` elements are never read, so password and
 * payment fields never are.
 */

const EDITABLE = 'textarea, [contenteditable]:not([contenteditable="false"])';
const BUTTON = 'button, [role="button"], input[type="submit"]';
/** How far up from a generic button to look for the editable it belongs to. */
const GENERIC_REACH = 4;
const CONFIRM_POLL_MS = 50;
const CONFIRM_TIMEOUT_MS = 2000;
const DEDUPE_MS = 5000;

export function startRecorder(doc: Document, site: SiteConfig | undefined, onAsk: (text: string) => void): () => void {
  const inputSelector = site?.input ?? EDITABLE;
  let last: { text: string; at: number } | undefined;

  /** The input a send button belongs to: the nearest one up its ancestors (generic: within reach, or in its form). */
  function inputForButton(button: Element): HTMLElement | null {
    const form = site ? null : button.closest('form');
    if (form) return form.querySelector<HTMLElement>(EDITABLE);
    let box: Element | null = button;
    for (let up = 0; box && (site || up <= GENERIC_REACH); up++, box = box.parentElement) {
      const input = box.querySelector<HTMLElement>(inputSelector);
      if (input) return input;
    }
    return null;
  }

  function sent(input: HTMLElement) {
    const text = inputText(input);
    if (!text) return;
    const startedAt = Date.now();
    const check = () => {
      if (!input.isConnected || inputText(input) !== text) {
        const now = Date.now();
        if (last && last.text === text && now - last.at < DEDUPE_MS) return;
        last = { text, at: now };
        onAsk(text);
      } else if (Date.now() - startedAt < CONFIRM_TIMEOUT_MS) {
        setTimeout(check, CONFIRM_POLL_MS);
      }
    };
    setTimeout(check, CONFIRM_POLL_MS);
  }

  const target = (e: Event) => e.composedPath()[0] as Element | undefined;

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.keyCode === 229) return;
    const input = target(e)?.closest?.<HTMLElement>(inputSelector);
    if (input) sent(input);
  }

  function onClick(e: MouseEvent) {
    const button = target(e)?.closest?.(site?.send ?? BUTTON);
    const input = button && inputForButton(button);
    if (input) sent(input);
  }

  // Capture phase: sites stop propagation and clear the box in their own handlers.
  doc.addEventListener('keydown', onKeydown, true);
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('keydown', onKeydown, true);
    doc.removeEventListener('click', onClick, true);
  };
}
