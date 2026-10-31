import { displayFormulas, type FormulaBlock } from './formulas';
import { UI_ATTR } from './text-quote';

/**
 * What the site script draws on an AI chat page: a ＋ beside every display formula
 * and the bottom toast. It lives in one shadow root over the page, positioned from
 * the formulas' boxes, so the site's own DOM is never touched.
 */

export interface PageUiText {
  add: string; // the ＋ button's label
  added: string; // the pill once recorded
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
[hidden] { display: none !important; }
`;

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
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

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
    });
  };
}
