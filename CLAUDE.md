# Chat2Know

Browser extension that turns AI conversations into a personal knowledge graph you can actually explain. Full plan: `docs/project-plan.md` (Chinese).

## North star

Weekly count of **mastered cards**: cards that passed "explain it to me" or "quiz me". Saving is not mastering.

## Product principles (in priority order)

1. A knowledge layer, not a chat UI. Works on top of any AI client.
2. Capture instantly, organize later, confirm in batches.
3. No per-site adapters. Capture text; let the model recover structure.
4. Local-first. No login, bring your own API key, full export at any time.
5. Two layers: distilled cards for reading, original text for provenance.
6. Verification over collection.
7. AI proposes structure, the user decides.

## Architecture rules

- Content script only captures. Side panel only renders UI. All model calls and DB reads/writes go through the background.
- API keys live only in `chrome.storage.local`, are used only in the background, never logged, never exported by default.
- All DB writes go through the repository layer in `src/db/`, which also appends to `oplog`.
- No "read all sites" permission. Inject content scripts on demand via `activeTab` + `scripting`.
- All user-facing strings go through i18n (`en` default, `zh_CN`). No hard-coded UI strings.

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
