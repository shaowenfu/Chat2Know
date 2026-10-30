# Site samples

Per-site samples for recording the user's own questions (learning diagnosis, D1).

| File | Site | What it contains |
| --- | --- | --- |
| `chatgpt-shell.html` | ChatGPT | Server-rendered page shell with the input box (`textarea`); no conversation |
| `claude-shell.html` | Claude | Page shell with the input box (`contenteditable`); no conversation |
| `gemini-shell.html` | Gemini | Page shell with the input box; no conversation |

Still missing (see `tasks/T002-site-snapshots.md`): the rendered input box with typed text, the send button and one sent user message for each of ChatGPT, Claude, Gemini, DeepSeek, Kimi and Doubao.

All files here pass `npm run sanitize -- --check`; the unit test `fixtures-clean` enforces it.
