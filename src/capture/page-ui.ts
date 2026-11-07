import { displayFormulas, type FormulaBlock } from './formulas';
import { UI_ATTR } from './text-quote';

/**
 * What the site script draws on an AI chat page: a ＋ beside every display formula,
 * the bar over a selection the user just made, and the bottom toast. It lives in one shadow root over the page, positioned from
 * the formulas' boxes, so the site's own DOM is never touched.
 */

export interface PageUiText {
  add: string; // the ＋ button's label
  added: string; // the pill once recorded
}

/** One button of the selection bar (artboard 12). */
export interface BarAction {
  id: 'note' | 'quote' | 'ask';
  label: string;
  run: () => void;
  disabled?: boolean;
  title?: string;
  /** The action keeps the bar for a next step (记下 asks how to note it). */
  keepBar?: boolean;
}

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

const RESCAN_MS = 250;
const OUTLINE_MS = 4000;
export const TOAST_MS = 4000;

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: 'Noto Sans SC', system-ui, sans-serif; }
.plus, .pill { position: fixed; box-sizing: border-box; height: 28px; border-radius: 14px; display: flex; align-items: center; justify-content: center; pointer-events: auto; }
.plus { width: 28px; padding: 0; border: 1px solid #C9C6BC; background: #FFFFFF; color: #3A3935; cursor: pointer; }
.plus:hover { border-color: #2B57D9; color: #2B57D9; }
.plus:focus-visible { outline: 2px solid #2B57D9; outline-offset: 2px; }
.pill { gap: 6px; padding: 0 10px; border: 0; background: #2B57D9; color: #FFFFFF; font-size: 12px; font-weight: 500; white-space: nowrap; }
.outline { position: fixed; box-sizing: border-box; border: 2px solid #2B57D9; border-radius: 10px; }
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 32px); box-sizing: border-box; padding: 10px 16px; border-radius: 10px; background: #1B1B19; color: #FFFFFF; font-size: 13px; line-height: 1.5; box-shadow: 0 8px 24px rgba(0,0,0,0.2); pointer-events: auto; }
.toast button { border: 0; padding: 0; background: none; font: inherit; color: #A9C0FF; cursor: pointer; text-decoration: underline; white-space: nowrap; }
.toast b { font-weight: 700; }
.picker { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: 420px; max-width: calc(100vw - 32px); box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 12px; border: 1px solid #D6D3CA; background: #FFFFFF; color: #1B1B19; box-shadow: 0 12px 32px rgba(0,0,0,0.16); font-size: 13px; pointer-events: auto; }
.picker-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.picker-title { font-size: 14px; font-weight: 700; }
.picker-now, .picker-field, .picker-empty { font-size: 12px; color: #5F5E58; }
.picker-options { display: flex; flex-direction: column; gap: 6px; }
.picker-option { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; border: 1px solid #E3E1DA; cursor: pointer; }
.picker-option.selected { border: 1.5px solid #2B57D9; background: #EAF0FF; }
.picker-option input { margin: 0; accent-color: #2B57D9; }
.picker-empty { margin: 0; }
.picker-field { display: flex; flex-direction: column; gap: 6px; }
.picker-field input { height: 36px; box-sizing: border-box; padding: 0 10px; border: 1px solid #D6D3CA; border-radius: 8px; font: inherit; font-size: 13px; color: #1B1B19; background: #FFFFFF; }
.picker-foot { display: flex; justify-content: space-between; align-items: center; }
.picker-buttons { display: flex; gap: 8px; }
.picker button { font: inherit; font-size: 13px; cursor: pointer; }
.picker-link { border: 0; padding: 0; background: none; color: #2B57D9; }
.picker-secondary, .picker-primary { height: 34px; padding: 0 14px; border-radius: 8px; }
.picker-secondary { border: 1px solid #D6D3CA; background: #FFFFFF; color: #1B1B19; }
.picker-primary { border: 0; background: #1B1B19; color: #FFFFFF; font-weight: 500; }
.picker-primary:disabled { opacity: 0.4; cursor: default; }
.bar { position: fixed; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 10px; background: #1B1B19; box-shadow: 0 8px 24px rgba(0,0,0,0.22); pointer-events: auto; }
.bar button { height: 32px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: #FFFFFF; font: inherit; font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
.bar button:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.bar button:focus-visible { outline: 2px solid #A9C0FF; outline-offset: -2px; }
.bar button[data-action="quote"] { color: #E2D3FF; }
.bar button[data-action="ask"] { color: #A9C0FF; }
.bar button:disabled { opacity: 0.4; cursor: default; }
.bar-prompt { display: flex; align-items: center; gap: 4px; margin: 0; }
.bar-prompt input { width: 300px; max-width: calc(100vw - 140px); height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 7px; background: #33322e; color: #FFFFFF; font: inherit; font-size: 13px; outline: none; }
.bar-prompt input::placeholder { color: #A3A19A; }
.bar-prompt input:focus-visible { box-shadow: 0 0 0 2px #A9C0FF; }
.marked { position: fixed; background: rgba(43, 87, 217, 0.22); border-radius: 2px; pointer-events: none; }
.ask { position: fixed; width: 440px; max-width: calc(100vw - 32px); box-sizing: border-box; display: flex; flex-direction: column; border-radius: 12px; border: 1px solid #D6D3CA; background: #FFFFFF; color: #1B1B19; box-shadow: 0 16px 40px rgba(0,0,0,0.18); font-size: 13px; line-height: 1.7; pointer-events: auto; }
.ask-head { height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 14px; border-bottom: 1px solid #E3E1DA; cursor: move; user-select: none; }
.ask-title { font-size: 13px; font-weight: 700; }
.ask-close { width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 16px; color: #5F5E58; cursor: pointer; }
.ask-close:hover { background: #F1F0EC; }
.ask-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; max-height: min(56vh, 460px); overflow-y: auto; }
.ask-quote { padding: 8px 10px; border-radius: 6px; background: #F4F3EF; border-left: 3px solid #C9C6BC; color: #3A3935; white-space: pre-wrap; max-height: 96px; overflow-y: auto; }
.ask-question { align-self: flex-end; max-width: 300px; padding: 8px 12px; border-radius: 12px; background: #F1F0EC; white-space: pre-wrap; overflow-wrap: anywhere; }
.ask-answer { display: flex; flex-direction: column; gap: 8px; }
.ask-text { overflow-wrap: anywhere; }
.ask-text p, .ask-text ul, .ask-text ol { margin: 0 0 6px; }
.ask-text ul, .ask-text ol { padding-left: 20px; }
.ask-text code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; background: #F4F3EF; padding: 0 3px; border-radius: 3px; }
.ask-text math[display="block"] { margin: 6px 0; overflow-x: auto; }
.ask-pending { color: #8F8C82; }
.ask-error { color: #B4480F; }
.ask-actions { display: flex; gap: 8px; }
.ask button { cursor: pointer; }
.ask-secondary, .ask-plain { height: 28px; padding: 0 10px; border-radius: 6px; font: inherit; font-size: 12px; }
.ask-secondary { border: 1px solid #D6D3CA; background: #FFFFFF; color: #1B1B19; }
.ask-secondary:hover:not(:disabled) { border-color: #2B57D9; }
.ask-protect { color: #7A4FB5; }
.ask-plain { border: 0; background: transparent; color: #5F5E58; }
.ask-secondary:disabled { opacity: 0.6; cursor: default; }
.ask-form { display: flex; gap: 8px; padding: 10px 14px 14px; margin: 0; }
.ask-input { flex: 1; min-width: 0; height: 36px; box-sizing: border-box; padding: 0 12px; border: 1px solid #D6D3CA; border-radius: 8px; font: inherit; font-size: 13px; color: #1B1B19; background: #FFFFFF; }
.ask-input:focus { outline: 2px solid #2B57D9; outline-offset: -1px; border-color: transparent; }
.ask-send { height: 36px; padding: 0 14px; border: 0; border-radius: 8px; background: #1B1B19; color: #FFFFFF; font: inherit; font-size: 13px; }
.ask-send:disabled { opacity: 0.4; cursor: default; }
.ask-note { padding: 0 14px 12px; font-size: 11.5px; line-height: 1.5; color: #5F5E58; }
[hidden] { display: none !important; }
`;

const BAR_GAP = 8;
const BAR_ICONS: Record<BarAction['id'], string> = {
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  quote: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"></path></svg>',
  ask: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg>',
};

const PLUS_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
const CHECK_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';

interface Mark {
  block: FormulaBlock;
  button: HTMLElement;
  recorded: boolean;
  outline?: HTMLElement;
}

/** The nearest ancestor that clips its content (a chat's scrolling column), cached per element. */
const clippers = new WeakMap<Element, Element | null>();
function clipperOf(el: Element): Element | null {
  if (clippers.has(el)) return clippers.get(el)!;
  let found: Element | null = null;
  for (let p = el.parentElement; p && p !== el.ownerDocument.documentElement; p = p.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(overflowY + overflowX)) {
      found = p;
      break;
    }
  }
  clippers.set(el, found);
  return found;
}

export class PageUi {
  private readonly host: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly marks = new Map<HTMLElement, Mark>();
  private readonly observer: MutationObserver;
  private frame = 0;
  private rescanTimer: ReturnType<typeof setTimeout> | undefined;
  private toastEl: HTMLElement | undefined;
  private toastKey: string | undefined;
  private toastText: HTMLElement | undefined;
  private popoverEl: HTMLElement | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private bar: { el: HTMLElement; range: Range; prompting?: boolean; marks?: HTMLElement[] } | undefined;
  private askEl: HTMLElement | undefined;

  constructor(
    private readonly doc: Document,
    private readonly text: PageUiText,
    private readonly onAdd: (block: FormulaBlock, ui: PageUi) => void,
  ) {
    this.host = doc.createElement('chat2know-ui');
    this.host.setAttribute(UI_ATTR, '');
    const root = this.host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    this.layer = doc.createElement('div');
    this.layer.className = 'layer';
    root.append(style, this.layer);
    doc.documentElement.append(this.host);

    this.observer = new MutationObserver((records) => {
      if (records.every((r) => this.host.contains(r.target))) return;
      this.rescanSoon();
    });
    this.observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    doc.addEventListener('scroll', this.place, { capture: true, passive: true });
    doc.defaultView!.addEventListener('resize', this.place, { passive: true });
    this.rescan();
  }

  stop(): void {
    this.observer.disconnect();
    this.doc.removeEventListener('scroll', this.place, { capture: true });
    this.doc.defaultView!.removeEventListener('resize', this.place);
    clearTimeout(this.rescanTimer);
    cancelAnimationFrame(this.frame);
    this.host.remove();
  }

  /** Whether an event happened inside this UI (its shadow root). */
  owns(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  /** The bar of actions above (or, near the top, below) the selected range; it follows the range on scroll. */
  showBar(range: Range, label: string, actions: BarAction[]): void {
    this.hideBar();
    const el = this.doc.createElement('div');
    el.className = 'bar';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', label);
    for (const action of actions) {
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.dataset.action = action.id;
      button.innerHTML = BAR_ICONS[action.id];
      button.append(action.label);
      button.disabled = action.disabled ?? false;
      if (action.title) button.title = action.title;
      // The page's selection must survive the click: it is what the action records.
      button.addEventListener('mousedown', (e) => e.preventDefault());
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!action.keepBar) this.hideBar();
        action.run();
      });
      el.append(button);
    }
    this.layer.append(el);
    this.bar = { el, range };
    this.place();
  }

  /** The floating question window, one at a time, beside the selection it is about; null takes it away. */
  askWindow(el: HTMLElement | null, near?: DOMRect): void {
    this.askEl?.remove();
    this.askEl = el ?? undefined;
    if (!el) return;
    this.layer.append(el);
    const view = this.doc.defaultView!;
    const r = near ?? new DOMRect(view.innerWidth / 2, view.innerHeight / 3, 0, 0);
    const { offsetWidth: w, offsetHeight: h } = el;
    // Below the selection, else above it, else as low as fits; the selection itself stays visible where it can.
    const below = r.bottom + BAR_GAP;
    const top = below + h <= view.innerHeight - BAR_GAP ? below : Math.max(BAR_GAP, Math.min(r.top - BAR_GAP - h, view.innerHeight - h - BAR_GAP));
    const left = Math.min(Math.max(BAR_GAP, r.left), view.innerWidth - w - BAR_GAP);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.querySelector<HTMLElement>('input')?.focus();
  }

  /**
   * "记下" asks how to note it: the bar becomes a box for an optional request. Enter
   * alone records as usual; Esc puts it away. Typing moves the focus off the page, so
   * the selected lines stay marked while the box is open.
   */
  promptBar(text: { label: string; placeholder: string; submit: string }, done: (request: string) => void): void {
    const bar = this.bar;
    if (!bar) return;
    const form = this.doc.createElement('form');
    form.className = 'bar-prompt';
    const input = this.doc.createElement('input');
    input.type = 'text';
    input.placeholder = text.placeholder;
    input.setAttribute('aria-label', text.label);
    input.maxLength = 300;
    const submit = this.doc.createElement('button');
    submit.type = 'submit';
    submit.dataset.action = 'note';
    submit.innerHTML = BAR_ICONS.note;
    submit.append(text.submit);
    form.append(input, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const request = input.value.trim();
      this.hideBar();
      done(request);
    });
    // Keys typed here are ours: the chat page must not take them (some move focus to their own box).
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      form.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') this.hideBar();
      });
    }
    bar.el.replaceChildren(form);
    bar.prompting = true;
    this.place();
    input.focus();
  }

  hideBar(): void {
    this.bar?.el.remove();
    this.bar?.marks?.forEach((m) => m.remove());
    this.bar = undefined;
  }

  get barShown(): boolean {
    return this.bar !== undefined;
  }

  /** The bar is asking how to note the selection; the page's selection may have gone meanwhile. */
  get barPrompting(): boolean {
    return this.bar?.prompting === true;
  }

  /** The ＋ of this formula becomes the "已记下" pill, with an outline around the formula for a moment. */
  markRecorded(block: FormulaBlock, recorded = true): void {
    const mark = this.marks.get(block.el);
    if (!mark) return;
    mark.recorded = recorded;
    this.render(mark);
    mark.outline?.remove();
    mark.outline = undefined;
    if (recorded) {
      const outline = this.doc.createElement('div');
      outline.className = 'outline';
      this.layer.prepend(outline);
      mark.outline = outline;
      setTimeout(() => {
        if (mark.outline === outline) {
          outline.remove();
          mark.outline = undefined;
        }
      }, OUTLINE_MS);
    }
    this.place();
  }

  /** The bottom toast: a message, `\uE000` in it marking the path to set in bold, and links. `key` names it for `updateToast`. */
  toast(message: string, bold: string, actions: ToastAction[], key?: string): void {
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const el = this.doc.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    const span = this.doc.createElement('span');
    this.fillToast(span, message, bold);
    el.append(span);
    for (const action of actions) {
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        this.hideToast();
        void action.run();
      });
      el.append(button);
    }
    this.layer.append(el);
    this.toastEl = el;
    this.toastKey = key;
    this.toastText = span;
    // Kept while the pointer is on it, so its links can be reached.
    const arm = () => (this.toastTimer = setTimeout(() => this.hideToast(), TOAST_MS));
    el.addEventListener('mouseenter', () => clearTimeout(this.toastTimer));
    el.addEventListener('mouseleave', arm);
    arm();
  }

  /** New text for the toast named `key`, if it is still showing; its links stay. */
  updateToast(key: string, message: string, bold: string): void {
    if (this.toastKey === key && this.toastText) this.fillToast(this.toastText, message, bold);
  }

  private fillToast(span: HTMLElement, message: string, bold: string): void {
    const [before, after = ''] = message.split('\uE000');
    const b = this.doc.createElement('b');
    b.textContent = bold;
    span.replaceChildren(before!, ...(message.includes('\uE000') ? [b, after] : []));
  }

  /** Shows one popover (the picker) instead of the toast; null closes it. */
  popover(el: HTMLElement | null): void {
    this.popoverEl?.remove();
    this.popoverEl = el ?? undefined;
    if (!el) return;
    this.hideToast();
    this.layer.append(el);
    el.querySelector<HTMLElement>('input:checked, input')?.focus();
  }

  hideToast(): void {
    clearTimeout(this.toastTimer);
    this.toastEl?.remove();
    this.toastEl = undefined;
    this.toastKey = undefined;
  }

  private rescanSoon(): void {
    this.rescanTimer ??= setTimeout(() => {
      this.rescanTimer = undefined;
      this.rescan();
    }, RESCAN_MS);
  }

  /** Finds the display formulas now on the page; streaming answers add them as they arrive. */
  private rescan(): void {
    const blocks = displayFormulas(this.doc.body);
    const seen = new Set(blocks.map((b) => b.el));
    for (const [el, mark] of this.marks) {
      if (seen.has(el)) continue;
      mark.button.remove();
      mark.outline?.remove();
      this.marks.delete(el);
    }
    for (const block of blocks) {
      const existing = this.marks.get(block.el);
      if (existing) {
        existing.block = block; // the LaTeX may have grown while streaming
        continue;
      }
      const button = this.doc.createElement('button');
      const mark: Mark = { block, button, recorded: false };
      button.type = 'button';
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!mark.recorded) this.onAdd(mark.block, this);
      });
      this.render(mark);
      this.layer.append(button);
      this.marks.set(block.el, mark);
    }
    this.place();
  }

  private render(mark: Mark): void {
    const b = mark.button;
    b.className = mark.recorded ? 'pill' : 'plus';
    b.setAttribute('aria-label', mark.recorded ? this.text.added : this.text.add);
    b.title = mark.recorded ? this.text.added : this.text.add;
    b.innerHTML = mark.recorded ? CHECK_SVG : PLUS_SVG;
    if (mark.recorded) b.append(this.text.added);
    b.dataset.state = mark.recorded ? 'added' : 'add';
  }

  private readonly place = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const view = this.doc.defaultView!;
      for (const mark of this.marks.values()) {
        const r = mark.block.el.getBoundingClientRect();
        const clip = clipperOf(mark.block.el)?.getBoundingClientRect();
        const top = Math.max(0, clip?.top ?? 0);
        const bottom = Math.min(view.innerHeight, clip?.bottom ?? Infinity);
        const mid = r.top + r.height / 2;
        const visible = r.width > 0 && r.height > 0 && mid - 14 >= top && mid + 14 <= bottom;
        mark.button.hidden = !visible;
        if (mark.outline) mark.outline.hidden = !visible;
        if (!visible) continue;
        const width = mark.button.offsetWidth || 28;
        mark.button.style.left = `${Math.round(r.right - 10 - width)}px`;
        mark.button.style.top = `${Math.round(mid - 14)}px`;
        if (mark.outline) Object.assign(mark.outline.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
      }
      if (this.bar) {
        this.placeBar(this.bar.el, this.bar.range, view);
        if (this.bar.prompting) this.markRange(this.bar);
      }
    });
  };

  private placeBar(el: HTMLElement, range: Range, view: Window): void {
    const r = range.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < view.innerHeight;
    el.hidden = !visible;
    if (!visible) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const above = r.top - BAR_GAP - h;
    const top = above >= BAR_GAP ? above : Math.min(r.bottom + BAR_GAP, view.innerHeight - h - BAR_GAP);
    const left = Math.min(Math.max(BAR_GAP, r.left + r.width / 2 - w / 2), view.innerWidth - w - BAR_GAP);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  /** Light-blue boxes over the selected lines, drawn in our layer: the page's own DOM is not touched. */
  private markRange(bar: { range: Range; marks?: HTMLElement[] }): void {
    bar.marks?.forEach((m) => m.remove());
    bar.marks = Array.from(bar.range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => {
        const m = this.doc.createElement('div');
        m.className = 'marked';
        Object.assign(m.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        this.layer.prepend(m);
        return m;
      });
  }
}
