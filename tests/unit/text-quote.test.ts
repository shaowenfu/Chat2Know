import { beforeEach, describe, expect, it } from 'vitest';
import { anchorQuote, buildTextIndex, quoteFromRange, UI_ATTR } from '@/src/capture/text-quote';

function rangeOver(el: Node, start: number, end: number): Range {
  const r = document.createRange();
  r.setStart(el, start);
  r.setEnd(el, end);
  return r;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('buildTextIndex', () => {
  it('collapses whitespace and separates blocks', () => {
    document.body.innerHTML = '<p>Hello\n   world</p><p>again</p><script>var x</script>';
    expect(buildTextIndex(document.body).text).toBe('Hello world again');
  });

  it('keeps inline elements joined', () => {
    document.body.innerHTML = '<p>a<b>bc</b>d</p>';
    expect(buildTextIndex(document.body).text).toBe('abcd');
  });

  it('skips our own UI', () => {
    document.body.innerHTML = `<p>page</p><div ${UI_ATTR}>Save</div>`;
    expect(buildTextIndex(document.body).text).toBe('page');
  });
});

describe('quoteFromRange / anchorQuote', () => {
  it('captures exact text with context', () => {
    document.body.innerHTML = '<p>The quick brown fox jumps over the lazy dog</p>';
    const text = document.querySelector('p')!.firstChild!;
    const quote = quoteFromRange(rangeOver(text, 10, 19), document.body)!;
    expect(quote).toEqual({ exact: 'brown fox', prefix: 'The quick ', suffix: ' jumps over the lazy dog' });
  });

  it('trims whitespace at selection edges', () => {
    document.body.innerHTML = '<p>one two three</p>';
    const text = document.querySelector('p')!.firstChild!;
    expect(quoteFromRange(rangeOver(text, 3, 8), document.body)!.exact).toBe('two');
  });

  it('handles ranges spanning blocks and element boundaries', () => {
    document.body.innerHTML = '<p id="a">first para</p><p id="b">second para</p>';
    const r = document.createRange();
    r.setStart(document.getElementById('a')!.firstChild!, 6);
    r.setEnd(document.getElementById('b')!, 1);
    expect(quoteFromRange(r, document.body)!.exact).toBe('para second para');
  });

  it('returns null for empty selections', () => {
    document.body.innerHTML = '<p>text</p>';
    const text = document.querySelector('p')!.firstChild!;
    expect(quoteFromRange(rangeOver(text, 2, 2), document.body)).toBeNull();
  });

  it('round-trips a quote back to the same DOM range', () => {
    document.body.innerHTML = '<div><p>Alpha <em>beta</em> gamma</p><p>delta</p></div>';
    const r = document.createRange();
    r.setStart(document.querySelector('em')!.firstChild!, 0);
    r.setEnd(document.querySelectorAll('p')[1]!.firstChild!, 3);
    const quote = quoteFromRange(r, document.body)!;
    expect(quote.exact).toBe('beta gamma del');
    const anchored = anchorQuote(quote, document.body)!;
    expect(anchored.startContainer).toBe(r.startContainer);
    expect(anchored.startOffset).toBe(0);
    expect(anchored.endContainer).toBe(r.endContainer);
    expect(anchored.endOffset).toBe(3);
  });

  it('uses prefix and suffix to pick among repeated text', () => {
    document.body.innerHTML = '<p>apple pie</p><p>banana pie</p><p>cherry pie</p>';
    const anchored = anchorQuote({ exact: 'pie', prefix: 'banana ', suffix: ' cherry' }, document.body)!;
    expect(anchored.startContainer).toBe(document.querySelectorAll('p')[1]!.firstChild);
  });

  it('survives whitespace changes in the page', () => {
    document.body.innerHTML = '<p>knowledge   graph\n  layer</p>';
    const anchored = anchorQuote({ exact: 'graph layer', prefix: '', suffix: '' }, document.body)!;
    expect(anchored.toString().replace(/\s+/g, ' ')).toBe('graph layer');
  });

  it('returns null when the quote is gone', () => {
    document.body.innerHTML = '<p>something else</p>';
    expect(anchorQuote({ exact: 'missing', prefix: '', suffix: '' }, document.body)).toBeNull();
  });
});
