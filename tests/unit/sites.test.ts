import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITES, inputText, messageText, siteFor } from '@/src/capture/sites';

/**
 * Checks every site config against the element samples the product owner copied from
 * the real sites (tests/fixtures/sites/<id>-elements.html). Unverified fields are skipped.
 */
const EXPECTED: Record<string, { input: string; message: string }> = {
  chatgpt: { input: '用公式、Python 代码和对比表格解释 softmax', message: '我怎么完全看不懂 PPT 上写的呢' },
  claude: { input: '矩阵的运算规则有哪些', message: '所以第五题到底想让我理解什么呢' },
  gemini: { input: '我知道了', message: '用公式、Python 代码和对比表格解释 softmax' },
  deepseek: { input: '为什么不可对角化', message: '为什么不可对角化，怎么理解' },
  kimi: { input: '我知道了', message: '用公式、Python 代码和对比表格解释 softmax' },
  doubao: { input: '帮我解释一下 softmax', message: '用公式、Python 代码和对比表格解释 softmax' },
};

function load(id: string): Document {
  const html = readFileSync(join(__dirname, `../fixtures/sites/${id}-elements.html`), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

const section = (doc: Document, name: string) => doc.querySelector(`section[data-sample="${name}"]`)!;

describe.each(SITES)('$name site config', (site) => {
  const doc = load(site.id);

  it('finds the input and reads what was typed', () => {
    const found = section(doc, 'input').querySelectorAll(site.input);
    expect(found).toHaveLength(1);
    expect(inputText(found[0]!)).toBe(EXPECTED[site.id]!.input);
  });

  it.skipIf(site.unverified.includes('send'))('finds the send button', () => {
    expect(section(doc, 'send').querySelectorAll(site.send)).toHaveLength(1);
  });

  it.skipIf(site.unverified.includes('userMessage'))('finds a sent message and reads only the question', () => {
    const found = section(doc, 'user-message').querySelectorAll(site.userMessage);
    expect(found).toHaveLength(1);
    expect(messageText(site, found[0]!)).toBe(EXPECTED[site.id]!.message);
  });

  it('no selector matches outside its own sample', () => {
    expect(section(doc, 'user-message').querySelectorAll(site.input)).toHaveLength(0);
    if (!site.unverified.includes('userMessage')) expect(section(doc, 'input').querySelectorAll(site.userMessage)).toHaveLength(0);
  });
});

describe('siteFor', () => {
  it('maps hostnames to configs and nothing else', () => {
    expect(siteFor('chatgpt.com')?.id).toBe('chatgpt');
    expect(siteFor('www.kimi.com')?.id).toBe('kimi');
    expect(siteFor('example.com')).toBeUndefined();
  });
});
