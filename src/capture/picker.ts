import type { Place } from '@/src/services/relocate';

/** The "改位置" picker on the page (artboard 8): three other places, search, a new topic, cancel / move. */

export interface PickerText {
  title: string;
  now: string; // "现在在：矩阵 › 迹", already filled in
  search: string;
  searchPlaceholder: string;
  noMatch: string;
  newTopic: string;
  newTopicPlaceholder: string;
  newTopicUnder: (path: string) => string;
  cancel: string;
  move: string;
}

export interface PickerOptions {
  text: PickerText;
  places: Place[];
  search: (query: string) => Promise<Place[]>;
  move: (to: { placeId: string; newTopic?: string }) => Promise<void>;
  close: () => void;
}

const SEP = ' › ';
const SEARCH_DELAY_MS = 150;

/** A new topic goes under the chosen chapter, or beside the chosen topic. */
const newTopicParent = (p: Place) => (p.path.length >= 3 ? p.path.slice(0, -1) : p.path);

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export function buildPicker(doc: Document, o: PickerOptions): HTMLElement {
  const t = o.text;
  let shown = o.places;
  let selected: Place | undefined = shown[0];
  let creating = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const root = el(doc, 'div', 'picker');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t.title);

  const head = el(doc, 'div', 'picker-head');
  head.append(el(doc, 'span', 'picker-title', t.title), el(doc, 'span', 'picker-now', t.now));

  const options = el(doc, 'div', 'picker-options');
  options.setAttribute('role', 'radiogroup');
  options.setAttribute('aria-label', t.title);

  const searchLabel = el(doc, 'label', 'picker-field', t.search);
  const search = el(doc, 'input');
  search.placeholder = t.searchPlaceholder;
  searchLabel.append(search);

  const newLabel = el(doc, 'label', 'picker-field');
  const newHint = el(doc, 'span');
  const newInput = el(doc, 'input');
  newInput.placeholder = t.newTopicPlaceholder;
  newLabel.append(newHint, newInput);
  newLabel.hidden = true;

  const foot = el(doc, 'div', 'picker-foot');
  const newButton = el(doc, 'button', 'picker-link', t.newTopic);
  const buttons = el(doc, 'div', 'picker-buttons');
  const cancel = el(doc, 'button', 'picker-secondary', t.cancel);
  const move = el(doc, 'button', 'picker-primary', t.move);
  for (const b of [newButton, cancel, move]) b.type = 'button';
  buttons.append(cancel, move);
  foot.append(newButton, buttons);

  root.append(head, options, searchLabel, newLabel, foot);

  function render() {
    options.replaceChildren(
      ...(shown.length
        ? shown.map((p) => {
            const label = el(doc, 'label', `picker-option${p.id === selected?.id ? ' selected' : ''}`);
            const radio = el(doc, 'input');
            radio.type = 'radio';
            radio.name = 'chat2know-place';
            radio.checked = p.id === selected?.id;
            radio.addEventListener('change', () => {
              selected = p;
              render();
            });
            label.append(radio, p.path.join(SEP));
            return label;
          })
        : [el(doc, 'p', 'picker-empty', t.noMatch)]),
    );
    newHint.textContent = selected ? t.newTopicUnder(newTopicParent(selected).join(SEP)) : '';
    move.disabled = !selected || (creating && !newInput.value.trim());
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = search.value.trim();
      shown = q ? await o.search(q) : o.places;
      selected = shown.find((p) => p.id === selected?.id) ?? shown[0];
      render();
    }, SEARCH_DELAY_MS);
  });
  newButton.addEventListener('click', () => {
    creating = true;
    newButton.hidden = true;
    newLabel.hidden = false;
    newInput.focus();
    render();
  });
  newInput.addEventListener('input', render);
  const submit = async () => {
    if (move.disabled || !selected) return;
    move.disabled = true;
    await o.move({ placeId: selected.id, ...(creating ? { newTopic: newInput.value.trim() } : {}) });
  };
  move.addEventListener('click', () => void submit());
  cancel.addEventListener('click', o.close);
  root.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the chat page's own shortcuts stay out of the picker
    if (e.key === 'Escape') o.close();
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'radio') void submit();
  });

  render();
  return root;
}
