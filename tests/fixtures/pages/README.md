# Page fixtures

Every `.html` here is converted by the capture code and compared with `../expected/<name>.md`.

| File | Source | Language | Saved | Contains |
| --- | --- | --- | --- | --- |
| `synthetic-chat-katex.html` | hand-written | en | 2026-10-21 | KaTeX inline + display, code, table, list |
| `synthetic-chat-zh.html` | hand-written | zh | 2026-10-27 | Chinese text, list |
| `arxiv-en-onevision-encoder.html` | arxiv.org abstract page | en | 2026-10-30 | headings, links, table |
| `zhihu-zh-embodied-ai.html` | zhuanlan.zhihu.com article | zh | 2026-10-30 | long Chinese article, images, lists |

Real AI chat conversations (with rendered formulas, code and tables) are still missing; see `tasks/T002-site-snapshots.md` for how to save them so the conversation is included.
