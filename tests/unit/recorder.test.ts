import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRecorder } from '@/src/capture/recorder';
import { SITES, inputText, type SiteConfig } from '@/src/capture/sites';

const PAGES: Record<string, string> = {
  chatgpt: 'chatgpt-zh-softmax',
  claude: 'claude-zh-ai-math',
  gemini: 'gemini-zh-logarithm',
  deepseek: 'deepseek-zh-matrix',
  kimi: 'kimi-zh-softmax',
  doubao: 'doubao-zh-softmax',
};

/** Loads a saved page into the test document, without the parts happy-dom would try to fetch. */
function loadPage(name: string) {
  const html = readFileSync(join(__dirname, `../fixtures/pages/${name}.html`), 'utf8').replace(/<(iframe|script|link|style)\b[\s\S]*?(<\/\1>|>)/gi, '');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
}

function type(input: HTMLElement, text: string) {
  if (input instanceof HTMLTextAreaElement) input.value = text;
  else input.textContent = text;
}

const enter = (el: Element, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, ...init }));

let asks: string[];
let stop: () => void;
function record(site: SiteConfig | undefined) {
  asks = [];
  stop = startRecorder(document, site, (t) => asks.push(t));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe.each(SITES)('recorder on a saved $name page', (site) => {
  beforeEach(() => {
    loadPage(PAGES[site.id]!);
    record(site);
  });
  // The input next to the send button (ChatGPT keeps a second, empty composer in the page).
  const composer = () => {
    const send = document.querySelector(site.send)!;
    let box: Element | null = send;
    while (box && !box.querySelector(site.input)) box = box.parentElement;
    return { send, input: box!.querySelector<HTMLElement>(site.input)! };
  };

  it('records the question sent with Enter', () => {
    const { input } = composer();
    type(input, '为什么要转置？');
    enter(input.firstElementChild ?? input); // keys land on the caret's element inside rich editors
    type(input, ''); // the site clears the box after sending
    vi.advanceTimersByTime(100);
    expect(asks).toEqual(['为什么要转置？']);
  });

  it('records the question sent with the send button', () => {
    const { input, send } = composer();
    type(input, '维度为什么对不上');
    (send.querySelector('svg') ?? send).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    type(input, '');
    vi.advanceTimersByTime(100);
    expect(asks).toEqual(['维度为什么对不上']);
  });

  it('records nothing when the site does not send (the text stays in the box)', () => {
    const { input } = composer();
    type(input, '还在生成时按了回车');
    enter(input);
    vi.advanceTimersByTime(5000);
    expect(asks).toEqual([]);
  });
});

describe('recorder, generic rule', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form><textarea id="q"></textarea><button type="submit" id="go">Go</button></form>
      <div id="editor"><div contenteditable="true" id="ce"><p id="line"></p></div><div><span role="button" id="send">↑</span></div></div>
      <div><input type="password" id="pw"><input type="text" id="name"><button id="login">Log in</button></div>`;
    record(undefined);
  });
  const el = (id: string) => document.getElementById(id)!;

  it('records Enter in a textarea and a click on the button of its form', () => {
    type(el('q'), 'first');
    enter(el('q'));
    type(el('q'), '');
    type(el('q'), 'second');
    el('go').click();
    type(el('q'), '');
    vi.advanceTimersByTime(100);
    expect(asks).toEqual(['first', 'second']);
  });

  it('records a contenteditable box and a button next to it', () => {
    type(el('ce'), 'rich text question');
    el('send').click();
    type(el('ce'), '');
    vi.advanceTimersByTime(100);
    expect(asks).toEqual(['rich text question']);
  });

  it('ignores Shift+Enter, modifiers and Enter while an input method is composing', () => {
    type(el('q'), 'draft');
    enter(el('q'), { shiftKey: true });
    enter(el('q'), { ctrlKey: true });
    enter(el('q'), { isComposing: true });
    type(el('q'), '');
    vi.advanceTimersByTime(100);
    expect(asks).toEqual([]);
  });

  it('never reads input fields, so passwords are never recorded', () => {
    (el('pw') as HTMLInputElement).value = 'hunter2';
    (el('name') as HTMLInputElement).value = 'me';
    enter(el('pw'));
    enter(el('name'));
    el('login').click();
    (el('pw') as HTMLInputElement).value = '';
    vi.advanceTimersByTime(3000);
    expect(asks).toEqual([]);
  });

  it('a box that is edited, not emptied, was not sent', () => {
    type(el('q'), 'first line');
    enter(el('q')); // a newline in a multi-line box
    type(el('q'), 'first line\nsecond');
    vi.advanceTimersByTime(3000);
    expect(asks).toEqual([]);
  });

  it('reports the same text once within a few seconds', () => {
    type(el('q'), 'same');
    enter(el('q'));
    el('go').click(); // implicit form submission clicks the submit button too
    type(el('q'), '');
    vi.advanceTimersByTime(100);
    expect(asks).toEqual(['same']);
  });
});

it('inputText reads what the user typed', () => {
  document.body.innerHTML = '<textarea id="t"></textarea>';
  type(document.getElementById('t')!, '  hi ');
  expect(inputText(document.getElementById('t')!)).toBe('hi');
});
