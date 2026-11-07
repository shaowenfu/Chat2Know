# Chat2Know

A browser extension that is a knowledge map for your notes and a coach for your questions: while you chat with an AI, select something and one click records it in the right place on the map you opened, or asks about it right there. Plan: `docs/project-plan.md` (Chinese). UI: the design canvas "Chat2Know 界面设计" (https://claude.ai/artifact/YbcpyaNR6aWbC2EvmAAsjr). The next stage (selection layer, protected quotes, in-place questions, question recording and reports): the doc "Chat2Know 第一轮测试整理与下一阶段开发计划" (https://claude.ai/artifact/3tixrATXtJbfZbixUCucfR).

## Positioning

A note-taking knowledge map plus a question coach. The side panel records and shows the map; the extension answers short questions about what the user selected, notices when the user is stuck, and reports on the questions when asked. It is not general chat software and not a tutor that tests or grades.

## North star

Does the map truly show what the user has learned and what is missing, does recording one thing take a single click, and does the user get unstuck sooner?

## Three bottom lines (check every feature against them)

1. **The extension is never more complex than the page it serves.** The side panel does one thing per screen; recording one item takes at most one click.
2. **Notes are simpler than the original, unless the user protects them or asks otherwise.** A recorded statement is compressed to one sentence and a formula comes in as just a formula. A **protected** quote (a line whose exact words matter) is kept word for word and never rewritten. A **request** the user types after 记下 ("keep the table") comes before the one-sentence rule; Enter alone keeps the default.
3. **The extension asks; it never forces things into the map.** A solid node is either recorded by the user or added by the extension with the user's consent. The extension never creates or switches maps on its own.

## Explicitly not doing (check before adding anything)

- No general chat. Asking in the extension only starts from a selection on the page (the floating question window), and its conversation is not kept; an answer the user wants goes to the map.
- No review, quizzing schedules, spaced repetition, scores or mastery percentages. Reports on the questions are written analysis, generated only when the user asks.
- No choosing a type, writing a title or confirming anything for each note. (The request box after 记下 is optional: Enter alone records as usual.)
- Nothing appears on the chat page unless the user acted: the selection layer appears only after the user selects text; the stuck guidance appears only in the side panel.
- No solid nodes added to the map automatically; no map created, renamed by the user, or switched by the extension.

## The map

- The user creates maps (one per subject or topic) and opens one; everything recorded goes into the open map until the user opens another. A map the user created without a name is named from its content once; a name the user gave is never changed. With no map open, recording asks the user to create or open one.
- Structure nodes (map › chapter › topic, at most 4 levels, titles are nouns) and items (leaves): a **formula** (LaTeX, kept verbatim), a **statement** (one sentence; a long selection is compressed to one, the full text stays in the source; written as the user asked when they typed a request: a table, a list), or a **protected quote** (the selection word for word; the model only chooses its place; only the user edits it; shown in its own colour).
- Statements and quotes are Markdown, shown sanitized (`src/ui/rich-html.ts`): tables, lists, displayed formulas and a page's images keep their shape.
- Every item has one place and one source (page URL and quote) that jumps back to the conversation through an explicit button, never a plain click on the item.
- Origin decides how a node looks: `user` (solid black), `plugin` (light blue dashed, added with consent), `outline` (grey dashed, not yet learned). Orange outline on a structure node = the user may be stuck there. "Grey" is derived (no non-outline item below), never stored.
- Recording never waits for a model: the item appears at once (in the previous place of this conversation, or the open map's "待归位" group), then automatic placement moves it within the open map.
- Questions the user sends (on the chat sites and in the floating window) are recorded by default, each into the map open at the time; every 5 new questions in a map, the model reads that map's questions in order and, if the user is circling or stuck, the side panel offers gentle guidance.

## Architecture rules

- Content scripts only capture. The side panel and the full-page map (`entrypoints/map/`) only render UI. All model calls and DB reads/writes go through the background.
- API keys live only in `chrome.storage.local`, are used only in the background, never logged, never exported.
- All DB writes go through the repository layer in `src/db/`. Map writes append to the `oplog` and can be undone; the local-only question tables (recorded questions, stuck checks, reports) are not logged and never in the default export.
- Permissions: on the AI sites the user ticks in Settings, one content script stays registered (`scripting.registerContentScripts`, host access requested for exactly those sites) for the selection layer, the ＋ beside formulas, the floating question window and question recording (on by default, can be turned off). Everywhere else only `activeTab` (shortcut and context menu). Never a "read all sites" permission.
- All user-facing strings go through `i18n.t` from `src/i18n` (locale files `locales/en.json` and `zh_CN.json`, bundled so the language can switch at runtime), and model prompts are kept in both languages; the language follows the browser unless the user picks one in Settings. Errors the user can act on are `UserError(i18nKey, subs)`; internal invariants and provider errors stay verbatim.
- One model configuration: an OpenAI-compatible base URL, model, key and optional embedding model (`src/llm/`). Model JSON is validated strictly; bad output is an error, never patched.
- No defensive fallbacks. Let errors surface; catch only where there is a real recovery.
- Business logic lives in `src/services/`, `src/graph/` and `src/db/` as plain TypeScript (no extension APIs).

## UI follows the design

UI changes are checked against the design canvas first. A deviation is explained in the commit or PR. E2E screenshots (`tests/e2e/screenshots/`) are compared with the artboards after every UI change.

## Branches

- Develop directly on `main`, unless the owner explicitly asks for a branch. The main engineer (Claude Code, cloud) pushes to `main` after `npm run check` passes.
- Task-card branches, when the owner asks for them, start from `main` and open PRs back into `main`.
- Releases are tagged on `main` (`v<version>`, see `.github/workflows/release.yml`); the landing page in `site/` deploys from `main`.
- `v2` was the branch of the 0.2 rebuild. It is merged into `main` and no longer developed on.

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
