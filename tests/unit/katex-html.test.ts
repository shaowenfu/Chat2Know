import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { katexHtmlTex } from '@/src/capture/katex-html';

/**
 * These saved pages carry both KaTeX's HTML and the TeX source, so the rebuild from HTML
 * alone (what Kimi pages need) can be checked against what the author wrote.
 */
function formula(page: string, source: string): Element {
  const html = readFileSync(join(__dirname, `../fixtures/pages/${page}.html`), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const katex = Array.from(doc.querySelectorAll('.katex')).find((k) => k.querySelector('annotation')?.textContent?.trim() === source);
  return katex!.querySelector('.katex-html')!;
}

describe('katexHtmlTex', () => {
  it.each([
    ['deepseek-zh-matrix', '\\sigma(\\mathbf{z})_i = \\frac{e^{z_i}}{\\sum_{j=1}^{n} e^{z_j}}', 'σ(\\mathbf{z})_{i} = \\frac{e^{z_{i}}}{∑_{j=1}^{n} e^{z_{j}}}'],
    ['deepseek-zh-matrix', 'D = \\begin{pmatrix} 2 & 0 \\\\ 0 & 1 \\end{pmatrix}', 'D = (\\begin{matrix} 2 & 0 \\\\ 0 & 1 \\end{matrix})'],
    ['chatgpt-zh-softmax', 'S=\\frac{QK^T}{\\sqrt{d_k}}', 'S = \\frac{QK^{T}}{\\sqrt{d_{k}}}'],
    ['chatgpt-zh-softmax', 'L=-\\sum_i y_i\\log p_i', 'L = − ∑_{i} y_{i} \\log p_{i}'],
    ['chatgpt-zh-softmax', '\\frac{\\partial p_i}{\\partial z_j}\n=-p_ip_j,\\quad i\\neq j', '\\frac{∂p_{i}}{∂z_{j}} = −p_{i}p_{j}, i \\not = j'],
    ['claude-zh-ai-math', '\\text{tr}(AB) = \\text{tr}(BA)', '\\text{tr}(AB) = \\text{tr}(BA)'],
  ])('%s: %s', (page, source, expected) => {
    expect(katexHtmlTex(formula(page, source))).toBe(expected);
  });

  it('keeps operator names KaTeX does not know as \\operatorname', () => {
    const source = '\\boxed{\n\\operatorname{Attention}(Q,K,V)\n=\n\\operatorname{Softmax}\n\\left(\n\\frac{QK^T}{\\sqrt{d_k}}\n\\right)V\n}';
    expect(katexHtmlTex(formula('chatgpt-zh-softmax', source))).toBe(
      '\\operatorname{Attention}(Q, K, V) = \\operatorname{Softmax} (\\frac{QK^{T}}{\\sqrt{d_{k}}}) V',
    );
  });
});
