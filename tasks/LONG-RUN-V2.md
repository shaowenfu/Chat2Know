---
id: LR3
status: doing
branch: v2
owner: main engineer (cloud)
---

# LR3: v2 rebuild, R0 → R6

Single source of truth for this run. If context is lost, re-read this file, `CLAUDE.md` and
`docs/project-plan.md`, check `git log` on `v2`, and continue from the first unchecked box. The design
canvas (https://claude.ai/artifact/YbcpyaNR6aWbC2EvmAAsjr, 8 artboards) is the reference for every UI step.

## Ground rules

- The three bottom lines and the "not doing" list in `CLAUDE.md` decide every question. Occam's razor; no
  defensive fallbacks; no stored value that can be derived.
- Each step: `npm run check` green (`npm run check > log && git commit`, never chained with `;`), UI
  screenshots compared with the artboards, one Conventional Commit on `v2` with this file updated, pushed.
- R6 merges `v2` into `main` only after the owner's one-week trial; until then `main` stays frozen.

## Tests: what was deleted in R0 and where it comes back

| v0.1 test | R0 | Comes back as |
| --- | --- | --- |
| `e2e/ask-later`, `ask-now`, `mastery`, `quiz`, `teacher` | deleted | — (features dropped) |
| `e2e/sidepanel` (capture, export / import, source jump) | deleted | R2 record flow, R1/R4 export / import, R4 source jump |
| `e2e/recording` (site ticks, gate, badge, password never read) | kept (messages only) | R2 merges it into the site script; UI part in R4 settings |
| `e2e/model` (settings, test connection, key never exported) | kept (messages only) | R4 settings page |
| `e2e/tree` (drag and drop) | deleted | R4 side panel drag |
| `e2e/placement` | deleted | R3 automatic placement |
| `e2e/organize` | deleted | — (not in v2 scope) |
| `e2e/diagnosis` | deleted | R5 gaps flow |
| unit: capture, katex, sites, recorder, fixtures, llm client, signals / rootcause / prereq, export md / opml, locales | kept | — |
| unit: quiz, explain, confirm, services (ask / distill / keep), mastery, placement, organize, anki, analysis, diagnose, tagging | deleted | R3 placement, R5 tagging / gaps (algorithms kept in `src/graph/`) |
| unit: db | rewritten in R1 | — |

## R0: clear the ground

- [x] R0.1 `v2` branch; new `CLAUDE.md`; `docs/project-plan.md` replaced by the v2 plan; v0.1 plan, diagnosis module and task cards archived; CI on `v2`.
- [x] R0.2 Delete the dropped features: side panel views, services, prompts, messages, repository methods and their tests and strings. Side panel shows one empty view. `check` green; no references left.

## R1: data layer

- [x] R1.1 New database `chat2know-v2`: `nodes` (MapNode with parent, order and source), `placements`, `embeddings`, `asks`, `askTags`, `prereqEdges`, `gaps`, `oplog`. Repository: add subject / section / item (with source), move, rename, merge sections, soft delete (items move up), restore, undo (every map write), list a subject's tree.
- [x] R1.2 Export JSON / Markdown / OPML (grey nodes left out by default); import v2 JSON (lossless round trip) and v0.1 JSON (knowledge cards → items in the subject's 待归位 group).

## R2: recording

- [x] R2.1 One site script per ticked site (recorder's registration, one grant): ＋ beside display formula blocks (generic detection, MutationObserver for streaming answers), recording only when the setting is on.
- [x] R2.2 Record flow: ＋ click / Alt+S / context menu → background stores the item within 1 s (previous topic of this conversation, else 待归位), dedupe by normalized LaTeX, bottom toast "已记到 … · 改位置 · 撤销".
- [x] R2.3 Acceptance: ＋ on all 6 site fixtures with identical LaTeX; not injected on unticked sites; duplicates not added.

## R3: automatic placement

- [x] R3.1 Candidates by vectors; one placement prompt (subject, path or new topic, compress long text); placement examples; mock tasks; move + toast update.
- [x] R3.2 Relocate picker (3 candidates, search, new topic) on the page; without a key: embedding-only or 待归位. Eval set and baseline.

## R4: map UI

- [x] R4.1 Side panel: subject switcher, outline tree (fold, drag, context menu: move / edit / delete), "刚记下" mark, empty map and no-model states, 待归位 group with drag.
- [x] R4.2 `entrypoints/map/`: full-page map (tree + detail pane, toggles, export) and settings page (model, sites + recording, data). Screenshots compared with artboards 2, 3, 6, 7.

## R5: outline and gaps

- [ ] R5.1 Lay out an outline (model / pasted table of contents), grey nodes, re-place existing items; ask once per subject.
- [ ] R5.2 Tagging onto section nodes; `gaps` with orange marks, timing, daily limit, 30-day cool-down; "出道题试试"; "整理进来" adds plugin items.

## R6: release 0.2.0

- [ ] R6.1 README, store listing, migration notes; self-review; `check` green.
- [ ] R6.2 After the owner's one-week trial: merge `v2` into `main`, release 0.2.0.

## Log

- R0.1: The v0.1 docs are archived in `docs/archive-v0.1/`; their release-era files (`PRIVACY.md`, `docs/install.md`, `docs/store-listing.md`) stay and are rewritten in R6.
- R0.2: The old DB schema and types (`src/db/schema.ts`, `types.ts`) and the old-type users `src/export/*` and `src/graph/tree.ts` stay until R1 rebuilds the data layer on a new database; the repository is already cut down to recorded questions. Commands and the `contextMenus` permission are removed until R2 adds "记到导图". Locale files hold only the strings in use. The tag / prerequisite / circling prompts and `src/graph/` algorithms stay for R5; their service code went.
- R1.1: Parent, order and source live on the node (one parent, one source per node), so there are no `edges` / `sources` tables. Undo reverts a whole oplog group except nodes changed since (compared without their write time); an undo always logs a marker so it is never undone twice. `restore` = undo of the node's latest deletion. Deleting a subject soft-deletes its whole map. The `edit` method is the user's; the extension's own rewrites come with R3. Markdown / OPML export already take subject trees.
- R1.2: JSON export = every live node (grey ones too) under `format: chat2know, version: 2`; import merges by id as one undoable write and checks every node and its parent strictly. A v0.1 file (`version: 1`) becomes a new subject "Imported notes" with one formula item per display formula of a knowledge card, else one statement (summary, else first line), in its 待归位 group; R3 placement will move them. Messages `map/export` / `map/import` with a message-level E2E; the buttons come with the R4 settings page.
- R2: The site script (`entrypoints/site.content.ts`) replaces the recorder: ＋ and toast live in one open shadow root over the page (`src/capture/page-ui.ts`), positioned from the formulas' boxes, so the site's DOM is never touched; a MutationObserver rescans every 250 ms while answers stream. Display formulas use the converter's own rules (`src/capture/formulas.ts`); the unit test checks every saved page gives exactly the converter's `$$` blocks. Doubao's saved page has inline formulas only, so it shows no ＋. Settings key `sites` replaces `recording`: `recordAsks` replaces "paused" and is off by default; the script attaches the question listener only while it is on (storage change listener) and the background still gates every question. With no conversation history the item goes to the 待归位 group of the subject recorded into last; with no subject, a new "Untitled subject" is created in the same undoable write. Statement dedupe is exact (normalized text) until R3 adds vectors. Toast "改位置" comes with R3.2.
- R3.1: Placement runs in the background right after a record when a model is set up, and its writes join the record's oplog group, so the toast's 撤销 takes both back; `fileItem` checks inside its transaction that the item was not undone, moved or edited since the model call started (the user's action wins). The prompt gets the item, its quote context, where it is now, up to 8 candidate topics by vectors (only with an embedding model; topic vectors cached in `embeddings` until their text changes), every subject's outline (titles only) and the last 20 placements the user corrected. Missing sections are created by title; an untouched "Untitled subject" takes the model's subject name; emptied 待归位 groups and untitled subjects go in the same write. A model error keeps the item where it is and the toast says so. Without a key nothing is placed (embeddings need the same key, so "embedding-only" placement does not exist).
- R3.2: The toast's "改位置" opens the picker (artboard 8) in the page's shadow root: three other places (closest topics by vectors with an embedding model, else the topics recorded into last), search by title, "＋ 新建知识点" (a new topic under the chosen chapter, or beside the chosen topic; the hint says where), 取消 / 移过去. The move is one undoable write; a placed item's new path becomes a placement example. Deviation from the artboard: the first option is preselected (the artboard shows the second). Eval: `data/placement.json` (16 notes on a seeded map of three subjects, one note of a subject not on the map) measures subject / topic accuracy and statement length; the harness dry-runs against the mock. **Baseline pending:** this container has no model key, so the owner's first `npm run eval` with `.env.local` sets it (commit `results/latest.json`).
- R4: Shared UI lives in `src/ui/` (tokens from the canvas, `MapBranch.vue` tree used by both the side panel and the full page, `ContextMenu.vue`, `SiteChecklist.vue`, KaTeX rendering in `math.ts`). **New dependency: `katex`** (MIT): the map shows typeset formulas as the artboards do; its fonts bring the package to about 1.7 MB. The side panel follows the subject recorded into last until the user picks one; 刚记下 marks an item recorded in the last 10 minutes and unfolds the path to it. Saving a model, or importing, places the items waiting in 待归位 in the background (one at a time); an error there only reaches the extension's error log for now. Import now rejects order keys that are not fractional indexes. Screenshots (`tests/e2e/screenshots/`, not committed) are taken in Chinese (`uiLang` fixture option) and were compared with artboards 1, 2, 3, 6, 7 and 8. Deviations: the full page is the outline tree plus detail pane decided in the plan, not artboard 2's horizontal mind map (the comparison of a hand-written layout with a library is still open); the empty state's hint is plain text (no bold ＋ / Alt S); the model card shows its connection state only after "测试连接"; settings has no "查看和删除提问记录" link and the detail pane no gap card until R5; side-panel delete shows an undo line in the footer instead of a dialog.
