import { answerHtml } from './answer-html';

/**
 * The floating question window (artboard 14): the selection, then each question
 * with its answer as it streams in, the answer's buttons (记到导图 / 保护原文 / 复制)
 * once it is done, and the box for the next question. Nothing in it is kept: it
 * goes when it is closed.
 */

export interface AskWindowText {
  title: string;
  close: string;
  firstPlaceholder: string;
  nextPlaceholder: string;
  send: string;
  record: string;
  recorded: string;
  protect: string;
  protected: string;
  copy: string;
  copied: string;
  note: string;
}

export interface AskTurn {
  question: string;
  answer: string;
}

export interface AskWindowOptions {
  text: AskWindowText;
  selection: string; // shown as the quote at the top
  /** Streams one answer: `onDelta` gets each piece; resolves when it is complete, rejects with the text to show. */
  ask: (question: string, turns: AskTurn[], onDelta: (delta: string) => void) => Promise<void>;
  /** Records the answer; `onRecorded` follows it (an undo, or a record made later from the toast). */
  record: (answer: string, onRecorded: (recorded: boolean) => void) => void;
  protect: (answer: string, onRecorded: (recorded: boolean) => void) => void;
  close: () => void;
}

export interface AskWindow {
  el: HTMLElement;
  /** Stops the answer being written, if any. */
  stop: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

const DONE_MS = 1500;

export function buildAskWindow(doc: Document, o: AskWindowOptions): AskWindow {
  const t = o.text;
  const turns: AskTurn[] = [];
  let busy = false;
  let stopped = false;

  const root = el(doc, 'section', 'ask');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t.title);

  const head = el(doc, 'div', 'ask-head');
  const close = el(doc, 'button', 'ask-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t.close);
  close.title = t.close;
  close.addEventListener('click', () => o.close());
  head.append(el(doc, 'span', 'ask-title', t.title), close);

  const body = el(doc, 'div', 'ask-body');
  body.append(el(doc, 'div', 'ask-quote', o.selection));

  const form = el(doc, 'form', 'ask-form');
  const input = el(doc, 'input', 'ask-input');
  input.placeholder = t.firstPlaceholder;
  input.setAttribute('aria-label', t.firstPlaceholder);
  const send = el(doc, 'button', 'ask-send', t.send);
  send.type = 'submit';
  form.append(input, send);

  root.append(head, body, form, el(doc, 'span', 'ask-note', t.note));

  const sync = () => {
    send.disabled = busy || !input.value.trim();
    input.placeholder = turns.length ? t.nextPlaceholder : t.firstPlaceholder;
  };
  input.addEventListener('input', sync);
  sync();

  /** A button that records the answer and then says so, until the record is undone. */
  const action = (label: string, doneLabel: string, className: string, run: (onRecorded: (recorded: boolean) => void) => void) => {
    const b = el(doc, 'button', className, label);
    b.type = 'button';
    b.addEventListener('click', () =>
      run((recorded) => {
        b.disabled = recorded;
        b.textContent = recorded ? doneLabel : label;
      }),
    );
    return b;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    busy = true;
    input.value = '';
    sync();

    const answerEl = el(doc, 'div', 'ask-answer');
    const textEl = el(doc, 'div', 'ask-text ask-pending', '…');
    answerEl.append(textEl);
    body.append(el(doc, 'div', 'ask-question', question), answerEl);
    body.scrollTop = body.scrollHeight;

    let answer = '';
    let frame = 0;
    const draw = () => {
      frame = 0;
      textEl.classList.remove('ask-pending');
      textEl.innerHTML = answerHtml(answer); // escaped text and KaTeX MathML (answer-html.ts)
      body.scrollTop = body.scrollHeight;
    };
    o.ask(question, [...turns], (delta) => {
      answer += delta;
      frame ||= requestAnimationFrame(draw);
    }).then(
      () => {
        if (stopped) return;
        cancelAnimationFrame(frame);
        draw();
        turns.push({ question, answer });
        const buttons = el(doc, 'div', 'ask-actions');
        const copy = el(doc, 'button', 'ask-plain', t.copy);
        copy.type = 'button';
        copy.addEventListener('click', () => {
          void navigator.clipboard.writeText(answer).then(() => {
            copy.textContent = t.copied;
            setTimeout(() => (copy.textContent = t.copy), DONE_MS);
          });
        });
        buttons.append(
          action(t.record, t.recorded, 'ask-secondary', (done) => o.record(answer, done)),
          action(t.protect, t.protected, 'ask-secondary ask-protect', (done) => o.protect(answer, done)),
          copy,
        );
        answerEl.append(buttons);
      },
      (err: unknown) => {
        if (stopped) return;
        cancelAnimationFrame(frame);
        textEl.classList.remove('ask-pending');
        textEl.classList.add('ask-error');
        textEl.textContent = err instanceof Error ? err.message : String(err);
      },
    ).finally(() => {
      busy = false;
      sync();
      if (!stopped) input.focus();
    });
  });

  // Keys typed here are ours: the chat page must not take them (some move focus to their own box).
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    root.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'keydown' && (e as KeyboardEvent).key === 'Escape') o.close();
    });
  }

  // The header moves the window.
  head.addEventListener('pointerdown', (e) => {
    if (e.target !== head && !(e.target as Element).classList.contains('ask-title')) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, left: root.offsetLeft, top: root.offsetTop };
    const move = (m: PointerEvent) => {
      const view = doc.defaultView!;
      root.style.left = `${Math.min(Math.max(0, start.left + m.clientX - start.x), view.innerWidth - root.offsetWidth)}px`;
      root.style.top = `${Math.min(Math.max(0, start.top + m.clientY - start.y), view.innerHeight - head.offsetHeight)}px`;
    };
    const up = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  });

  return {
    el: root,
    stop: () => {
      stopped = true;
    },
  };
}
