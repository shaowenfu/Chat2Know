# Page fixtures

Every `.html` here is converted by the capture code and compared with `../expected/<name>.md`.

| File | Source | Language | Saved | Contains |
| --- | --- | --- | --- | --- |
| `synthetic-chat-katex.html` | hand-written | en | 2026-10-21 | KaTeX inline + display, code, table, list |
| `synthetic-chat-zh.html` | hand-written | zh | 2026-10-27 | Chinese text, list |
| `arxiv-en-onevision-encoder.html` | arxiv.org abstract page | en | 2026-10-30 | headings, links, table |
| `zhihu-zh-embodied-ai.html` | zhuanlan.zhihu.com article | zh | 2026-10-30 | long Chinese article, images, lists |
| `chatgpt-zh-softmax.html` | chatgpt.com conversation | zh | 2026-10-30 | KaTeX with `data-math-source`, code blocks without `<pre>`, tables |
| `claude-zh-ai-math.html` | claude.ai conversation | zh | 2026-10-30 | KaTeX, tables, lists |
| `deepseek-zh-matrix.html` | chat.deepseek.com conversation | zh | 2026-10-30 | KaTeX, code with a language header bar, tables |
| `doubao-zh-softmax.html` | doubao.com conversation | zh | 2026-10-30 | formulas in `copy-text` (some drawn as SVG), code, tables |
| `gemini-zh-logarithm.html` | gemini.google.com conversation | zh | 2026-10-30 | formulas in `data-math` (empty KaTeX annotation), code with a header bar, tables |

The chat pages were saved with `copy(document.documentElement.outerHTML)`, sanitized (`npm run sanitize`), and slimmed: inline `<style>` and SVG contents removed, the conversation and its surrounding page frame kept.

Still missing: Kimi. Kimi renders KaTeX HTML only and keeps no TeX source in the page, so its formulas can only be captured as visible text.
