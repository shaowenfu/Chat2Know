# Chat2Know

Browser extension that turns AI conversations into a personal knowledge graph you can actually explain. Full plan: `docs/project-plan.md` (Chinese).

## North star

Weekly count of **passed "internalize" cards**: cards whose mastery requirement is *internalize* and that passed "quiz me" or "explain it to me". Saving does not count; *understand* and *index* cards do not count.

Core flow: **ask → keep or not → mastery requirement → verify**.

## Product principles (in priority order)

1. A knowledge layer, not a chat UI. Works on top of any AI client.
2. Capture instantly, organize later, confirm in batches.
3. Never interrupt reading. "Ask later" is the default; capturing never calls AI or pops up answers.
4. Asking is not recording. Answers go to a temporary inbox; only what is worth reusing enters the graph.
5. Questions are the entry point, statements are the content. Node titles are questions; distilled cards are statements.
6. No per-site adapters for capturing page content; capture text and let the model recover structure. The one exception is recording the user's own questions (learning diagnosis): a small per-site config with a generic fallback.
7. Local-first. No login, bring your own API key, full export at any time.
8. Two layers: distilled cards for reading, original text for provenance.
9. Verification over collection; verification strength follows the mastery requirement (internalize / understand / index).
10. AI proposes, the user decides: graph structure, keep-or-not and mastery all get AI defaults with one-click confirm.

## Architecture rules

- Content script only captures. Side panel only renders UI. All model calls and DB reads/writes go through the background.
- API keys live only in `chrome.storage.local`, are used only in the background, never logged, never exported by default.
- All DB writes go through the repository layer in `src/db/`, which also appends to `oplog`. Exceptions, not logged: the disposable `inbox` (promoting an item to a node is logged) and the local-only learning-diagnosis tables (`asks`, `askTags`, `concepts`, `prereqEdges`, `diagnoses`, `quizzes`), which are never in the default export.
- No "read all sites" permission. Inject content scripts on demand via `activeTab` + `scripting`. The one exception is the small `recorder` script (learning diagnosis): registered with `scripting.registerContentScripts` only on sites the user ticked, with host access requested for exactly those sites. It only reports sent questions; the background decides what is stored.
- All user-facing strings go through i18n (`en` default, `zh_CN`). No hard-coded UI strings. Errors the user can act on are thrown as `UserError(i18nKey, subs)` and translated where shown; internal invariant errors and provider errors stay verbatim.
- One model configuration: an OpenAI-compatible base URL, model, key and optional embedding model (`src/llm/`). Model JSON is validated strictly; bad output is an error, never patched.
- No defensive fallbacks. Let errors surface; catch only where there is a real recovery (e.g. storing a distill error on the card for retry).
- Business logic lives in `src/services/` and `src/db/` as plain TypeScript (no extension APIs), so it can be reused outside the extension.

## Commands

- `npm run dev` — dev build with watch (does not launch a browser)
- `npm run build` — production build to `.output/chrome-mv3`
- `npm run check` — typecheck, lint, unit tests, build, E2E. **Definition of done: this is green.**
- `npm run test` — unit tests only
- `npm run test:e2e` — Playwright E2E (headless Chromium with the extension loaded)

## Collaboration

- Main engineer (Claude Code, cloud) pushes directly to `main` after `npm run check` passes.
- Local agents work only from task cards in `tasks/`, on branch `task/<id>-<slug>`, and open a PR. Stay inside the card's scope; do not add dependencies or change interfaces unless the card says so.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Code, comments, commits in English.
- Update `CHANGELOG.md` for user-visible changes.

## Testing notes

- E2E builds a separate variant to `.output/chrome-mv3-e2e` with `CHAT2KNOW_E2E=1`, which adds `<all_urls>` host permission so tests can inject without a user gesture. Release builds never include it.
- E2E uses `/opt/pw-browsers/chromium` when present (cloud container), otherwise Playwright's own Chromium. Override with `CHROMIUM_PATH`.
- The side panel screenshot is written to `tests/e2e/screenshots/sidepanel.png`; look at it after UI changes.
- Page fixtures: every `tests/fixtures/pages/*.html` is converted and compared with `tests/fixtures/expected/*.md`. After a deliberate converter change, review the diff and update with `npx vitest run -u`.
- Turndown gives rules added later higher priority; add generic rules before specific ones in `src/capture/markdown.ts`.
- Model calls in tests go to the deterministic mock server in `tests/mock-llm/` (routes on the `[task:<name>]` tag every prompt carries; accepts only `Bearer test-key`). Never call a real model from `npm run check`.
- `npm run eval` (see `tests/eval/README.md`) measures quality against a real model from `.env.local`; it is not part of `check`.
