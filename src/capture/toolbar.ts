import { i18n } from '#i18n';
import { UI_ATTR } from './text-quote';

export type ToolbarAction = 'knowledge' | 'idea';

const CSS_TEXT = `
:host { all: initial; }
.bar {
  position: fixed; z-index: 2147483647; display: flex; gap: 2px; padding: 3px;
  border-radius: 8px; background: #1f2328; box-shadow: 0 4px 16px rgba(0,0,0,.25);
  font: 13px/1.2 system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
button {
  all: unset; cursor: pointer; padding: 5px 9px; border-radius: 6px; color: #fff;
}
button:hover, button:focus-visible { background: rgba(255,255,255,.16); }
.status { padding: 5px 9px; color: #9be9a8; }
.status.error { color: #ffa198; }
`;

/**
 * Floating toolbar shown next to a text selection. Lives in an open shadow root
 * so page styles cannot leak in (and E2E tests can reach it).
 */
export class SelectionToolbar {
  private readonly host: HTMLElement;
  private readonly bar: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly doc: Document,
    private readonly onAction: (action: ToolbarAction) => Promise<void>,
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
    this.doc.addEventListener('scroll', this.hide, true);
  }

  private isOwnEvent(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  private readonly onPointerDown = (e: Event) => {
    if (!this.isOwnEvent(e)) this.hide();
  };

  private readonly onPointerUp = (e: Event) => {
    if (this.isOwnEvent(e)) return;
    setTimeout(() => this.showForSelection(), 0);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.hide();
    else if (e.shiftKey || e.key.startsWith('Arrow')) this.showForSelection();
  };

  readonly hide = () => {
    clearTimeout(this.hideTimer);
    this.bar.hidden = true;
  };

  private showForSelection(): void {
    const sel = this.doc.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return this.hide();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    this.renderButtons();
    const view = this.doc.defaultView!;
    const top = rect.bottom + 8 + 36 > view.innerHeight ? rect.top - 40 : rect.bottom + 8;
    this.bar.style.top = `${Math.max(4, top)}px`;
    this.bar.style.left = `${Math.min(Math.max(4, rect.left), view.innerWidth - 220)}px`;
    this.bar.hidden = false;
  }

  private renderButtons(): void {
    this.bar.replaceChildren(
      this.button(i18n.t('toolbar.saveKnowledge'), 'knowledge'),
      this.button(i18n.t('toolbar.saveIdea'), 'idea'),
    );
  }

  private button(label: string, action: ToolbarAction): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    // Keep the page selection alive while clicking.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => void this.run(action));
    return b;
  }

  private async run(action: ToolbarAction): Promise<void> {
    try {
      await this.onAction(action);
      this.flash(i18n.t('toolbar.saved'), false);
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
    this.hideTimer = setTimeout(this.hide, 1200);
  }
}
