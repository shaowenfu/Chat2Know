---
id: T001
status: todo
branch: task/T001-page-snapshots
---

# T001: Collect AI chat page snapshots for capture tests

## Goal
Save real conversation pages from major AI chat sites as HTML fixtures, so capture code can be tested against them without logging in.

## Scope
- `tests/fixtures/pages/` (new `.html` files only)
- `tests/fixtures/pages/README.md` (create; list each file and its source)

## Steps
1. For each site below, open a conversation that contains **a math formula (rendered LaTeX), a code block, a table, and a bulleted list**. Ask the AI to produce them if needed. Make one Chinese and one English conversation per site where possible.
   - ChatGPT (chatgpt.com), Claude (claude.ai), Gemini (gemini.google.com), DeepSeek (chat.deepseek.com), Kimi (kimi.com)
   - Plus one arXiv abstract/HTML paper page (arxiv.org/html/...) and one ordinary blog post.
2. Save each page with the browser's "Save page as → Webpage, HTML only".
3. Name files `<site>-<lang>-<topic>.html`, e.g. `chatgpt-en-attention.html`, `kimi-zh-transformer.html`.
4. **Remove personal data**: open the file in an editor, search for your email, name, avatar URLs, account IDs, and replace them with `REDACTED`. Delete `<script>` tags with inline tokens if present.
5. In `README.md`, add a row per file: file name, site, language, date saved, what it contains (formula/code/table/list).

## Acceptance criteria
- [ ] At least 12 HTML files covering all 7 sources above.
- [ ] Each AI chat file contains at least one formula, one code block and one table.
- [ ] No email address, real name or access token appears in any file (`grep -riE "@|token|bearer" tests/fixtures/pages` reviewed by hand).
- [ ] `npm run check` passes.

## Do not
- Do not change any code or test files.
- Do not commit files larger than 3 MB; if a page is larger, delete inline `<style>`/`<svg>` blobs that are not part of the conversation.

## How to deliver
1. `git checkout -b task/T001-page-snapshots` from latest `main`.
2. Add files, run `npm run check`.
3. Set `status: review` above, commit (`test: add AI chat page snapshots`), push, open a PR to `main`.
