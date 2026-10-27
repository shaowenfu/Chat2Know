import { i18n } from '#i18n';
import type { AskDraft } from './ask';
import { UI_ATTR } from './text-quote';

export type SaveType = 'knowledge' | 'idea';

export interface ToolbarHandlers {
  save(type: SaveType): Promise<void>;
  /** Captures the selection for an ask-later question before the prompt takes focus. */
  prepareAsk(): AskDraft | null;
  /** Saves the question; resolves to how many times this term has been asked. */
  ask(draft: AskDraft, question: string): Promise<number>;
}

const CSS_TEXT = `
:host { all: initial; }
.bar {
  position: fixed; z-index: 2147483647; display: flex; gap: 2px; padding: 3px;
  border-radius: 8px; background: #1f2328; color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.25);
  font: 13px/1.2 system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.bar.ask { flex-direction: column; gap: 6px; padding: 8px; width: 320px; }
button {
  all: unset; cursor: pointer; padding: 5px 9px; border-radius: 6px; color: #fff;
}
button:hover, button:focus-visible { background: rgba(255,255,255,.16); }
.term { color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.term b { color: #fff; }
input {
  all: unset; box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px;
  background: #fff; color: #1f2328; font: inherit;
}
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chips button { padding: 3px 7px; background: rgba(255,255,255,.10); font-size: 12px; }
.hint { color: #9198a1; font-size: 11px; }
.status { padding: 5px 9px; color: #9be9a8; }
.status.error { color: #ffa198; }
`;

/**
 * Floating toolbar next to a text selection, plus the one-line "ask later"
 * prompt. Lives in an open shadow root so page styles cannot leak in (and
 * E2E tests can reach it).
 */
export class SelectionToolbar {
  private readonly host: HTMLElement;
  private readonly bar: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while the ask prompt is open; committing it saves the question. */
  private pending: { draft: AskDraft; input: HTMLInputElement } | null = null;

  constructor(
    private readonly doc: Document,
    private readonly handlers: ToolbarHandlers,
  ) {
    this.host = doc.createElement('div');
    this.host.setAttribute(UI_ATTR, 'toolbar');
    const root = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS_TEXT;
    this.bar = doc.createElement('div');
    this.bar.className = 'bar';
    this.bar.setAttribute('role', 'toolbar');
    this.bar.hidden = true;
    root.append(style, this.bar);
  }

  mount(): void {
    this.doc.documentElement.appendChild(this.host);
    this.doc.addEventListener('mouseup', this.onPointerUp, true);
    this.doc.addEventListener('keyup', this.onKeyUp, true);
    this.doc.addEventListener('mousedown', this.onPointerDown, true);
    this.doc.addEventListener('scroll', this.onScroll, true);
  }

  private isOwnEvent(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  private readonly onPointerDown = (e: Event) => {
    if (this.isOwnEvent(e)) return;
    // Clicking away from an open prompt still saves the question: nothing is lost.
    if (this.pending) void this.commitAsk();
    else this.hide();
  };

  private readonly onPointerUp = (e: Event) => {
    if (this.isOwnEvent(e) || this.pending) return;
    setTimeout(() => this.showForSelection(), 0);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (this.isOwnEvent(e) || this.pending) return;
    if (e.key === 'Escape') this.hide();
    else if (e.shiftKey || e.key.startsWith('Arrow')) this.showForSelection();
  };

  private readonly onScroll = () => {
    if (!this.pending) this.hide();
  };

  readonly hide = () => {
    clearTimeout(this.hideTimer);
    this.bar.hidden = true;
    this.bar.classList.remove('ask');
  };

  private place(rect: DOMRect, height: number): void {
    const view = this.doc.defaultView!;
    const top = rect.bottom + 8 + height > view.innerHeight ? rect.top - height - 8 : rect.bottom + 8;
    this.bar.style.top = `${Math.max(4, top)}px`;
    this.bar.style.left = `${Math.min(Math.max(4, rect.left), view.innerWidth - 340)}px`;
  }

  private showForSelection(): void {
    const sel = this.doc.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return this.hide();
    this.bar.classList.remove('ask');
    this.bar.replaceChildren(
      this.button(i18n.t('toolbar.saveKnowledge'), () => this.runSave('knowledge')),
      this.button(i18n.t('toolbar.saveIdea'), () => this.runSave('idea')),
      this.button(i18n.t('toolbar.askLater'), () => this.openAskPrompt()),
    );
    this.place(sel.getRangeAt(0).getBoundingClientRect(), 36);
    this.bar.hidden = false;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    // Keep the page selection alive while clicking.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', onClick);
    return b;
  }

  private async runSave(type: SaveType): Promise<void> {
    try {
      await this.handlers.save(type);
      this.flash(i18n.t('toolbar.saved'), false);
    } catch {
      this.flash(i18n.t('toolbar.failed'), true);
    }
  }

  /** Opens the one-line question prompt for the current selection. Returns false when nothing is selected. */
  openAskPrompt(): boolean {
    if (this.pending) return true;
    const draft = this.handlers.prepareAsk();
    if (!draft) return false;

    const term = this.doc.createElement('div');
    term.className = 'term';
    const b = this.doc.createElement('b');
    b.textContent = draft.term;
    term.append(`${i18n.t('ask.label')} `, b);

    const input = this.doc.createElement('input');
    input.type = 'text';
    input.placeholder = i18n.t('ask.placeholder');
    input.setAttribute('aria-label', i18n.t('ask.placeholder'));
    // Keep host-page shortcuts from reacting to typing in our field.
    for (const type of ['keydown', 'keypress', 'keyup'] as const) input.addEventListener(type, (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) void this.commitAsk();
      else if (e.key === 'Escape') void this.commitAsk(); // save now, write the question later
    });

    const chips = this.doc.createElement('div');
    chips.className = 'chips';
    const templates = [i18n.t('ask.chipWhat', [draft.term]), i18n.t('ask.chipWhy', [draft.term]), i18n.t('ask.chipDiff', [draft.term]), i18n.t('ask.chipRole', [draft.term])];
    for (const text of templates) {
      chips.append(
        this.button(text, () => {
          input.value = text;
          input.focus();
          // Select the "…" placeholder so the user can type over it.
          const gap = text.indexOf('…');
          if (gap >= 0) input.setSelectionRange(gap, gap + 1);
        }),
      );
    }

    const hint = this.doc.createElement('div');
    hint.className = 'hint';
    hint.textContent = i18n.t('ask.hint');

    this.pending = { draft, input };
    this.bar.classList.add('ask');
    this.bar.replaceChildren(term, input, chips, hint);
    this.place(draft.termRange.getBoundingClientRect(), 130);
    this.bar.hidden = false;
    input.focus();
    return true;
  }

  private async commitAsk(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.bar.classList.remove('ask');
    try {
      const count = await this.handlers.ask(pending.draft, pending.input.value);
      this.flash(count > 1 ? i18n.t('ask.savedRepeat', [String(count)]) : i18n.t('ask.saved'), false);
    } catch {
      this.flash(i18n.t('toolbar.failed'), true);
    }
  }

  private flash(text: string, error: boolean): void {
    const status = this.doc.createElement('span');
    status.className = error ? 'status error' : 'status';
    status.setAttribute('role', 'status');
    status.textContent = text;
    this.bar.replaceChildren(status);
    this.bar.hidden = false;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(this.hide, 1500);
  }
}
