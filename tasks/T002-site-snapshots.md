---
id: T002
status: doing
branch: task/T002-site-snapshots
supersedes: T001
---

# T002: Real AI chat pages: conversation snapshots and input/send samples

Replaces T001. Needs a logged-in browser, so the **product owner does steps 1–3 by hand** (about 30–40 minutes). Step 4 can be handed to a local agent.

## Why
- Conversation snapshots prove the capture converter (formulas, code, tables) works on real sites, not only on hand-written fixtures.
- Input and send samples let the main engineer write per-site configs for recording questions (learning diagnosis D1). Without them selectors would be guesses.

## Sites
ChatGPT (chatgpt.com), Claude (claude.ai), Gemini (gemini.google.com), DeepSeek (chat.deepseek.com), Kimi (kimi.com), Doubao (doubao.com). Plus, for step 1 only: one arXiv HTML paper page and one ordinary blog post.

## Steps

### 1. Conversation page (each site)
1. Open a conversation that contains **a rendered formula, a code block, a table and a bulleted list**. Ask for them if needed, e.g. "Explain softmax with its formula, a Python snippet, and a comparison table." Use one Chinese and one English conversation where possible.
2. Wait for the answer to finish. **Do not use Ctrl+S**: these sites draw the conversation with JavaScript, and "Save page" stores the original server HTML without it (the first attempt on 2026-10-30 produced page shells with 10–90 characters of text).
3. Instead, open DevTools (F12) → **Console**, run `copy(document.documentElement.outerHTML)`, and paste into a new file `tests/fixtures/pages/<site>-<lang>-<topic>.html`, e.g. `chatgpt-en-softmax.html`, `doubao-zh-softmax.html`. This is the page as you see it, conversation included.
4. Check: open the file in a text editor and search for a word from the answer. If it is not there, the copy did not work.

### 2. Input and send sample (each of the 5 chat sites)
In the same conversation, type a question in the input box but **do not send it**. Then open DevTools (F12) and copy three elements, each with right-click on the element in the Elements panel → **Copy → Copy outerHTML**:

1. **The input box**: right-click the input area on the page → Inspect. Copy the editable element (a `textarea`, or the element with `contenteditable="true"`). If it is huge, copy the closest ancestor that still contains the send button instead and note that.
2. **The send button**: right-click the send button → Inspect → copy the `button` element.
3. **One of your own sent messages**: right-click one of your earlier messages in the conversation → Inspect → copy the element that wraps the whole message bubble.

Paste them into `tests/fixtures/sites/<site>.md` using this template:

````markdown
# <site>

- URL pattern: e.g. https://chatgpt.com/c/<id>
- Enter sends: yes / no
- Shift+Enter makes a new line: yes / no
- Notes: anything unusual (send button only appears after typing, input is inside an iframe, etc.)

## Input (with typed text, not sent)
```html
...outerHTML...
```

## Send button
```html
...outerHTML...
```

## One of my sent messages
```html
...outerHTML...
```
````

### 3. Remove secrets and personal data (required, before `git add`)
Saved pages contain live session tokens and keys (the 2026-10-30 ChatGPT page carried an access token, Gemini pages carry API keys). Run:

```bash
CHAT2KNOW_REDACT='your name|your handle' npm run sanitize -- tests/fixtures/pages/*.html tests/fixtures/sites/*.html
```

It removes all `<script>` blocks (except formula scripts), token meta tags, API keys, JWTs, account/user ids, avatar URLs, emails, and the names you list. Then search the files yourself for your name and email once more. `npm run check` fails if anything is left (unit test `fixtures-clean`), and after `npm install` a pre-commit hook refuses to commit an unsanitized page under `tests/`.

### 4. Generate expected output (can be a local agent)
Run `npx vitest run tests/unit/fixtures.test.ts -u`. This writes `tests/fixtures/expected/<name>.md` for each new page. Commit them as generated; do **not** edit them by hand. The main engineer reviews them and fixes the converter where the output is wrong.

## Scope
- `tests/fixtures/pages/*.html` (new files)
- `tests/fixtures/pages/README.md` (one row per file: name, site, language, date saved, contains formula/code/table/list)
- `tests/fixtures/sites/<site>.md` (new files)
- `tests/fixtures/expected/*.md` (generated only)

## Acceptance criteria
- [x] arXiv and a blog (Zhihu) page.
- [ ] Conversation pages for all 6 chat sites, saved with `copy(document.documentElement.outerHTML)` so the conversation is included. (5 of 6 done 2026-10-30; Kimi missing.)
- [x] Each chat page contains at least one formula, one code block and one table.
- [x] Element samples for all 6 chat sites (from Notion, turned into `tests/fixtures/sites/<site>-elements.html` and checked by `tests/unit/sites.test.ts`).
- [ ] Missing samples listed in `tests/fixtures/sites/README.md` (ChatGPT/Claude send button and Doubao user message done 2026-10-30; one DeepSeek answer left).
- [x] `npm run sanitize -- --check` passes and no name or email remains (checked by hand).
- [x] Files under 3 MB each (strip large inline `<style>`/`<svg>` blobs if needed).
- [ ] `npm run check` passes. Expected outputs may show conversion problems; that is fine, they are the point.

## Do not
- Do not change code or existing tests.
- Do not "fix" expected outputs by hand.

## How to deliver
1. `git checkout -b task/T002-site-snapshots` from the latest `main`.
2. Add the files, run `npm run check`.
3. Set `status: review` above, commit (`test: add real AI chat page snapshots and input samples`), push, open a PR to `main`.
