import { describe, expect, it } from 'vitest';
import { describePage } from '@/src/capture/page-info';

describe('describePage', () => {
  it('reports title, url and text length', () => {
    document.title = 'Sample';
    document.body.innerHTML = '<p>  hello world  </p>';
    expect(describePage(document, 'https://example.com/a')).toEqual({
      url: 'https://example.com/a',
      title: 'Sample',
      textLength: 'hello world'.length,
    });
  });
});
