# Chat2Know

A browser extension that is a knowledge map for your notes: while you chat with an AI, one click puts a formula or conclusion in the right place on your map. Plan: `docs/project-plan.md` (Chinese). UI: the design canvas "Chat2Know 界面设计" (https://claude.ai/artifact/YbcpyaNR6aWbC2EvmAAsjr).

## Positioning

A note-taking knowledge map. The side panel is a recording tool, not learning software.

## North star

Does the map truly show what the user has learned and what is missing, and does recording one thing take a single click?

## Three bottom lines (check every feature against them)

1. **The extension is never more complex than the page it serves.** The side panel does one thing per screen; recording one item takes at most one click.
2. **Notes are simpler than the original.** If what gets recorded is longer or more complex than the conversation, it is not worth recording. A formula comes in as just a formula.
3. **The extension asks; it never forces things into the map.** A solid node is either recorded by the user or added by the extension with the user's consent.

## Explicitly not doing (check before adding anything)

- No question answering in the extension. Asking happens only in the chat page.
- No review, quizzing, spaced repetition or mastery statistics.
- No choosing a type, writing a title or confirming anything for each note.
- No suggestions popping up while the user reads or asks.
- No solid nodes added to the map automatically.

## The map

- One map per subject. Structure nodes (subject › chapter › topic, at most 4 levels, titles are nouns) and items (leaves): a **formula** (LaTeX, kept verbatim) or a **statement** (one sentence; a long selection is compressed to one, the full text stays in the source).
- Every item has one place and one source (page URL and quote) that jumps back to the conversation.
- Origin decides how a node looks: `user` (solid black), `plugin` (light blue dashed, added with consent), `outline` (grey dashed, not yet learned). Orange outline on a structure node = possible gap. "Grey" is derived (no non-outline item below), never stored.
- Recording never waits for a model: the item appears at once (in the previous place of this conversation, or the subject's "待归位" group), then automatic placement moves it.

## Architecture rules

- Content scripts only capture. The side panel and the full-page map (`entrypoints/map/`) only render UI. All model calls and DB reads/writes go through the background.
- API keys live only in `chrome.storage.local`, are used only in the background, never logged, never exported.
- All DB writes go through the repository layer in `src/db/`. Map writes append to the `oplog` and can be undone; the local-only recording and diagnosis tables (`asks`, `askTags`, `prereqEdges`, `gaps`) are not logged and never in the default export.
- Permissions: on the AI sites the user ticks in Settings, one content script stays registered (`scripting.registerContentScripts`, host access requested for exactly those sites) for the ＋ buttons and, if the user turns it on, question recording. Everywhere else only `activeTab` (shortcut and context menu). Never a "read all sites" permission.
- All user-facing strings go through i18n (`en` default, `zh_CN`). Errors the user can act on are `UserError(i18nKey, subs)`; internal invariants and provider errors stay verbatim.
- One model configuration: an OpenAI-compatible base URL, model, key and optional embedding model (`src/llm/`). Model JSON is validated strictly; bad output is an error, never patched.
- No defensive fallbacks. Let errors surface; catch only where there is a real recovery.
- Business logic lives in `src/services/`, `src/graph/` and `src/db/` as plain TypeScript (no extension APIs).

## UI follows the design

UI changes are checked against the design canvas first. A deviation is explained in the commit or PR. E2E screenshots (`tests/e2e/screenshots/`) are compared with the artboards after every UI change.

## Branches

- Develop only on `v2`. `main` is frozen at v0.1.0 (security and severe-bug fixes only, through PRs).
- Main engineer (Claude Code, cloud) pushes to `v2` after `npm run check` passes. Task-card branches start from `v2` and open PRs back into `v2`.
- `v2` is merged into `main` when it passes acceptance, released as 0.2.0. `v2` is a codename, not a version.

## Commands

- `npm run dev` — dev build with watch (does not launch a browser)
- `npm run build` — production build to `.output/chrome-mv3`
- `npm run check` — typecheck, lint, unit tests, build, E2E. **Definition of done: this is green.**
- `npm run test` — unit tests only
- `npm run test:e2e` — Playwright E2E (headless Chromium with the extension loaded)

## Collaboration

- Local agents work only from task cards in `tasks/`, stay inside the card's scope, and do not add dependencies or change interfaces unless the card says so.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Code, comments, commits in English.
- Update `CHANGELOG.md` for user-visible changes.

## Testing notes

- E2E builds a separate variant to `.output/chrome-mv3-e2e` with `CHAT2KNOW_E2E=1`, which adds `<all_urls>` host permission so tests can inject without a user gesture. Release builds never include it.
- E2E uses `/opt/pw-browsers/chromium` when present (cloud container), otherwise Playwright's own Chromium. Override with `CHROMIUM_PATH`.
- Page fixtures: every `tests/fixtures/pages/*.html` is converted and compared with `tests/fixtures/expected/*.md`. After a deliberate converter change, review the diff and update with `npx vitest run -u`. Saved pages must pass `npm run sanitize -- --check` (a pre-commit hook enforces it).
- Turndown gives rules added later higher priority; add generic rules before specific ones in `src/capture/markdown.ts`.
- Model calls in tests go to the deterministic mock server in `tests/mock-llm/` (routes on the `[task:<name>]` tag every prompt carries; accepts only `Bearer test-key`). Never call a real model from `npm run check`.
- `npm run eval` (see `tests/eval/README.md`) measures quality against a real model from `.env.local`; it is not part of `check`.
