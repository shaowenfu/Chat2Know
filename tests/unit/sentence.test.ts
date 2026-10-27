import { beforeEach, describe, expect, it } from 'vitest';
import { sentenceRange } from '@/src/capture/sentence';
import { prepareAskDraft } from '@/src/capture/ask';

function select(text: Node, start: number, end: number): Range {
  const r = document.createRange();
  r.setStart(text, start);
  r.setEnd(text, end);
  return r;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sentenceRange', () => {
  it('expands an English term to its sentence', () => {
    document.body.innerHTML = '<p>Transformers use attention. A VLM pairs a vision encoder with a language model. It is popular.</p>';
    const t = document.querySelector('p')!.firstChild!;
    const at = t.textContent!.indexOf('VLM');
    expect(sentenceRange(select(t, at, at + 3)).toString()).toBe('A VLM pairs a vision encoder with a language model.');
  });

  it('expands a Chinese term to its sentence', () => {
    document.body.innerHTML = '<p>注意力机制很重要。视觉语言模型由视觉编码器和语言模型组成。它们越来越常见！</p>';
    const t = document.querySelector('p')!.firstChild!;
    const at = t.textContent!.indexOf('视觉编码器');
    expect(sentenceRange(select(t, at, at + 5), 'zh').toString()).toBe('视觉语言模型由视觉编码器和语言模型组成。');
  });

  it('handles mixed Chinese and English across inline elements', () => {
    document.body.innerHTML = '<p>先看背景。<b>InternVL3.5</b> 是一个 VLM 的例子。最后总结。</p>';
    const t = document.querySelector('b')!.firstChild!;
    expect(sentenceRange(select(t, 0, 11), 'zh').toString()).toBe('InternVL3.5 是一个 VLM 的例子。');
  });

  it('keeps selections that cross blocks unchanged', () => {
    document.body.innerHTML = '<p id="a">One. Two.</p><p id="b">Three.</p>';
    const r = document.createRange();
    r.setStart(document.getElementById('a')!.firstChild!, 5);
    r.setEnd(document.getElementById('b')!.firstChild!, 3);
    expect(sentenceRange(r)).toBe(r);
  });
});

describe('prepareAskDraft', () => {
  it('captures the term, its sentence and the anchor', () => {
    document.title = 'Chat';
    document.body.innerHTML = '<p>Intro here. Softmax turns scores into weights. Then sum.</p>';
    const t = document.querySelector('p')!.firstChild!;
    const at = t.textContent!.indexOf('Softmax');
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(select(t, at, at + 7));
    const draft = prepareAskDraft(document, 'https://x.dev/c')!;
    expect(draft.term).toBe('Softmax');
    expect(draft.capture.quote.exact).toBe('Softmax turns scores into weights.');
    expect(draft.capture.markdown).toBe('Softmax turns scores into weights.');
    expect(draft.capture.url).toBe('https://x.dev/c');
  });

  it('returns null without a selection', () => {
    document.getSelection()!.removeAllRanges();
    expect(prepareAskDraft(document, 'https://x.dev')).toBeNull();
  });
});
