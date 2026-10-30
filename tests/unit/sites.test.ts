import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITES, inputText, messageText, siteFor } from '@/src/capture/sites';

/**
 * Checks every site config against the element samples the product owner copied from
 * the real sites (tests/fixtures/sites/<id>-elements.html).
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

/** Full conversation pages saved on 2026-10-30, and the questions the product owner sent in them, in order. */
const PAGES: Record<string, { file: string; questions: string[] }> = {
  chatgpt: {
    file: 'chatgpt-zh-softmax',
    questions: [
      '用一个具体的例子，详细串联一遍这条流程的完整推导',
      '一般情况下怎么计算行列式来着，怎么计算矩阵的逆来着。对角化是针对谁说的，什么时候矩阵能对角化，特征向量是重根是什么意思，特征重数、几何重数这些是什么，跟对角化有什么关系，',
      '高斯–若尔当消元法的规则有哪些？什么是多元函数值，什么是多元向量值函数，什么是雅可比矩阵',
      '解释老师的板书',
      '我怎么完全看不懂 PPT 上写的呢',
      '用公式、Python 代码和对比表格解释 softmax',
    ],
  },
  claude: { file: 'claude-zh-ai-math', questions: ['所以第五题到底想让我理解什么呢', '矩阵的运算规则有哪些'] },
  gemini: { file: 'gemini-zh-logarithm', questions: ['对数函数有哪些性质', '用公式、Python 代码和对比表格解释 softmax'] },
  deepseek: { file: 'deepseek-zh-matrix', questions: ['给出计算结果', '用公式、Python 代码和对比表格解释 softmax'] },
  kimi: { file: 'kimi-zh-softmax', questions: ['用公式、Python 代码和对比表格解释 softmax'] },
  doubao: { file: 'doubao-zh-softmax', questions: ['用公式、Python 代码和对比表格解释 softmax'] },
};

describe.each(SITES)('$name site config', (site) => {
  const doc = load(site.id);

  it('finds the input and reads what was typed', () => {
    const found = section(doc, 'input').querySelectorAll(site.input);
    expect(found).toHaveLength(1);
    expect(inputText(found[0]!)).toBe(EXPECTED[site.id]!.input);
  });

  it('finds the send button', () => {
    expect(section(doc, 'send').querySelectorAll(site.send)).toHaveLength(1);
  });

  it('finds a sent message and reads only the question', () => {
    const found = section(doc, 'user-message').querySelectorAll(site.userMessage);
    expect(found).toHaveLength(1);
    expect(messageText(site, found[0]!)).toBe(EXPECTED[site.id]!.message);
  });

  if (section(doc, 'answer')) {
    it('does not take an answer for a user message', () => {
      expect(section(doc, 'answer').querySelectorAll(site.userMessage)).toHaveLength(0);
    });
  }

  it('no selector matches outside its own sample', () => {
    expect(section(doc, 'user-message').querySelectorAll(site.input)).toHaveLength(0);
    expect(section(doc, 'input').querySelectorAll(site.userMessage)).toHaveLength(0);
  });
});

describe.each(SITES)('$name site config on a full conversation page', (site) => {
  const page = PAGES[site.id]!;
  const doc = new DOMParser().parseFromString(readFileSync(join(__dirname, `../fixtures/pages/${page.file}.html`), 'utf8'), 'text/html');

  it('finds every question the user sent, and no answers', () => {
    expect(Array.from(doc.querySelectorAll(site.userMessage)).map((m) => messageText(site, m))).toEqual(page.questions);
  });

  // ChatGPT keeps a second, empty composer in the page; recording resolves the input from the event target.
  it('finds the input and one send button', () => {
    expect(doc.querySelectorAll(site.input).length).toBeGreaterThan(0);
    expect(doc.querySelectorAll(site.send)).toHaveLength(1);
  });
});

describe('siteFor', () => {
  it('maps hostnames to configs and nothing else', () => {
    expect(siteFor('chatgpt.com')?.id).toBe('chatgpt');
    expect(siteFor('www.kimi.com')?.id).toBe('kimi');
    expect(siteFor('example.com')).toBeUndefined();
  });
});
