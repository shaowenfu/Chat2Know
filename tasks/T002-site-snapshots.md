---
id: T002
status: todo
branch: task/T002-site-snapshots
supersedes: T001
---

# T002: Real AI chat pages: conversation snapshots and input/send samples

Replaces T001. Needs a logged-in browser, so the **product owner does steps 1–3 by hand** (about 30–40 minutes). Step 4 can be handed to a local agent.

## Why
- Conversation snapshots prove the capture converter (formulas, code, tables) works on real sites, not only on hand-written fixtures.
- Input and send samples let the main engineer write per-site configs for recording questions (learning diagnosis D1). Without them selectors would be guesses.

## Sites
ChatGPT (chatgpt.com), Claude (claude.ai), Gemini (gemini.google.com), DeepSeek (chat.deepseek.com), Kimi (kimi.com). Plus, for step 1 only: one arXiv HTML paper page and one ordinary blog post.

## Steps

### 1. Conversation page (each site)
1. Open a conversation that contains **a rendered formula, a code block, a table and a bulleted list**. Ask for them if needed, e.g. "Explain softmax with its formula, a Python snippet, and a comparison table." Use one Chinese and one English conversation where possible.
2. Wait for the answer to finish, then press Ctrl+S (Cmd+S on Mac) and choose **Webpage, HTML only**.
3. Save as `tests/fixtures/pages/<site>-<lang>-<topic>.html`, e.g. `chatgpt-en-softmax.html`, `kimi-zh-softmax.html`.

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

### 3. Remove personal data (required, do it yourself)
In every file, search for and replace with `REDACTED`: your email, your name, avatar image URLs, account/organization IDs, and anything that looks like a token (`token`, `bearer`, `session`, `sk-`). Delete `<script>` blocks that contain inline config or tokens. Do not commit a file you have not checked.

### 4. Generate expected output (can be a local agent)
Run `npx vitest run tests/unit/fixtures.test.ts -u`. This writes `tests/fixtures/expected/<name>.md` for each new page. Commit them as generated; do **not** edit them by hand. The main engineer reviews them and fixes the converter where the output is wrong.

## Scope
- `tests/fixtures/pages/*.html` (new files)
- `tests/fixtures/pages/README.md` (one row per file: name, site, language, date saved, contains formula/code/table/list)
- `tests/fixtures/sites/<site>.md` (new files)
- `tests/fixtures/expected/*.md` (generated only)

## Acceptance criteria
- [ ] Conversation pages for all 5 chat sites plus arXiv and a blog (at least 7 files; Chinese and English where possible).
- [ ] Each chat page contains at least one formula, one code block and one table.
- [ ] `tests/fixtures/sites/` has a filled template for all 5 chat sites.
- [ ] No email, real name or token in any file (checked by hand).
- [ ] Files under 3 MB each (strip large inline `<style>`/`<svg>` blobs if needed).
- [ ] `npm run check` passes. Expected outputs may show conversion problems; that is fine, they are the point.

## Do not
- Do not change code or existing tests.
- Do not "fix" expected outputs by hand.

## How to deliver
1. `git checkout -b task/T002-site-snapshots` from the latest `main`.
2. Add the files, run `npm run check`.
3. Set `status: review` above, commit (`test: add real AI chat page snapshots and input samples`), push, open a PR to `main`.
