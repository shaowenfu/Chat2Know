# Site samples

Samples for recording the user's own questions (learning diagnosis, D1). The selectors live in `src/capture/sites.ts`; `tests/unit/sites.test.ts` checks them against these files.

## Element samples (`<site>-elements.html`)

Copied by the product owner from the live sites on 2026-10-30 (source: Notion database "New database" under the Chat2Know page). Each file has up to three sections: `input` (the input box with typed text, not sent), `send` (the send button) and `user-message` (one sent question).

Changes made when turning the Notion records into HTML: Notion's Markdown escaping was undone; very long utility class lists and SVG paths were trimmed; Gemini's `jslog` tracking attribute was removed; the DeepSeek and Doubao inputs were empty in the records, so a sample question was typed into them.

The ChatGPT and Claude send buttons and the Doubao user message come from the full conversation pages saved on 2026-10-30 (`../pages/*-zh-*.html`), not from Notion: style attributes and SVG contents removed, nothing else changed.

| Site | Enter sends | Shift+Enter new line | Input | Send button | User message |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | yes | yes | ✓ ProseMirror `contenteditable` | ✓ `button[type="submit"].bg-composer-primary` | ✓ `[data-user-message-bubble]` |
| Claude | yes | yes | ✓ `[data-testid="chat-input"]` | ✓ `[data-testid="chat-input-send"]` | ✓ `[data-testid="user-message"]` |
| Gemini | yes | yes | ✓ `.ql-editor` | ✓ icon `arrow_upward` | ✓ `.user-query-bubble-with-background` (text from `.query-text-line`; the bubble also has a hidden "你说" label) |
| DeepSeek | yes | yes | ✓ `textarea` | ✓ `.ds-button--primary` | ✓ `.ds-message` (only hashed classes around it; answers assumed to contain `.ds-markdown`, not yet checked) |
| Kimi | yes | yes | ✓ Lexical `.chat-input-editor` | ✓ `.send-button-container` | ✓ `.user-content` |
| Doubao | yes | yes | ✓ ProseMirror `contenteditable` | ✓ `[data-testid="chat_input_send_button"]` | ✓ `[data-testid="send_message"][data-message-role="user"]` (text from `message_text_content`) |

Still needed: one DeepSeek answer (assistant) message, to confirm answers are not matched as user messages.

## Page shells (`<site>-shell.html`)

Server-rendered pages saved with Ctrl+S on 2026-10-30: they have no conversation, only the page frame. Kept as references; not used by tests except the secret scan.

All files here pass `npm run sanitize -- --check`; the unit test `fixtures-clean` enforces it.
