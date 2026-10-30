---
id: LR2
status: doing
branch: claude/wizardly-ramanujan-nw4ns1
owner: main engineer (cloud)
---

# LR2: Long run D1 → M5 → D2 → D3 → D4

Single source of truth for this run. If context is lost, re-read this file, `CLAUDE.md`,
`docs/project-plan.md` (§10 teacher mode, milestones) and `docs/module-learning-diagnosis.md`,
check `git log`, and continue from the first unchecked box.

## Ground rules (apply to every step)

- **First principles.** Every feature serves *ask → keep or not → mastery → verify* and the north
  star (weekly passed *internalize* cards). The diagnosis module serves it by turning repeated
  confusion into internalize cards that get verified. If a piece does not serve that, cut it.
- **Occam's razor.** Smallest design that meets the acceptance criteria. No speculative options,
  no abstraction with one implementation, no config nobody asked for, no stored value that can be
  derived.
- **No defensive fallbacks.** Errors propagate and are shown as-is. Catch only where there is a
  real recovery (a broadcast with no listener, a background batch that records its error).
- **Principle 3 holds for recording:** recording a sent question never calls a model. Tagging and
  diagnosis run later, in batches.
- **Definition of done per step:** `npm run check` green (run as `npm run check > log && git commit`,
  never chained with `;`), screenshots looked at for UI changes, one Conventional Commit on this
  branch with this file's boxes updated, branch pushed (backup).
- **Final:** self-review (correctness, redundancy, over-design), fix, re-run check, fast-forward
  `main`, push both.

## Decisions fixed up front (do not relitigate during the run)

| Topic | Decision | Why |
| --- | --- | --- |
| Recorder script | A second content script `recorder` (runtime-registered with `scripting.registerContentScripts`, main frame, `document_idle`) containing only `src/capture/recorder.ts` + `sites.ts`. Not the heavy capture script. | Keeps the always-on footprint tiny; capture script stays on-demand. |
| Enabling sites | The user ticks sites in the Learning tab: the 6 configured sites plus "this site" (current tab's origin, generic rule). Ticking requests the optional host permission for exactly those origins, then the background re-registers the recorder for all enabled origins and injects it into open tabs of those origins. | Plan: optional host permission, only ticked sites. |
| Gate | The background decides whether to store: origin enabled (from `sender.url`, not the payload), not paused, conversation not excluded. The recorder always reports. | One source of truth; "zero capture when paused / not enabled" is enforced in one place. |
| Capture rule | Configured site: Enter (no Shift/Ctrl/Alt/Meta, not composing) in `closest(site.input)`, or a click on `closest(site.send)`; text read from the input at that moment. Generic: Enter in a `textarea` or `contenteditable` element; click on a `button` / `[role=button]` inside the same `form` as, or within 4 ancestors of, the last focused editable. Never `input` elements, so password fields are never read. Same text within 5 s is reported once. | Doc §捕获方案. |
| Health check | Not built in this run. | Not in D1 acceptance; site configs are guarded by fixture tests. Revisit when a real breakage shows. |
| AI answer context | Not captured. | Open question in the doc; nothing downstream needs it yet. |
| Recording settings | `chrome.storage.local` key `recording`: `{ origins: string[], paused: boolean, excluded: string[] }` (excluded = conversation URLs). Badge "REC" on the action while any origin is enabled and not paused. | Plan: state visible, one-click pause. |
| Exclude a conversation | Adds its URL to `excluded` and deletes its asks. No `excluded` flag on asks. | Same effect, one less field. |
| Asks storage | Table `asks` (`id, site, conversationUrl, text, sentAt`, later `taggedAt`, `vector`, `vectorModel`). Not in the oplog, not in the default export; a separate "export my questions" JSON button. No import. | Doc privacy rules 3 and 5. |
| Schema | One new version **v4** holding every table of this run (`asks`, `askTags`, `concepts`, `prereqEdges`, `diagnoses`, `quizzes`). Unreleased, so later steps extend v4 in place. | One migration. |
| Apply mode (用它解题) | Internalize cards alternate: reviews with an even count of earlier reviews are `recall`, odd are `apply` when a model is configured (else `recall`). Apply = the model writes one short problem that needs the card's statement; the model judges the answer. `Review.mode` gains `'apply'`. | Plan: verification strength follows mastery. |
| Explain (讲给我听) | On any kept knowledge card ("Explain it to me"): the user types an explanation of the card and its subtree; the model returns a verdict per node (covered / missed / wrong + feedback). One review per node (`mode: 'explain'`). A node whose latest review is `fail` is shown red in the tree. Typing only, no voice. | "标红" derived from data; voice is an open question. |
| One-minute script | Generated on demand from a card's subtree statements (conclusion view), shown with a copy button. Not stored. | Regenerable; nothing reads it later. |
| North star | Distinct internalize cards with a passing review of any mode in the last 7 days. Stats panel adds the last 4 weeks. | Plan definition includes 考我 and 讲给我听. |
| Exports | Markdown becomes tree-ordered (heading depth follows the tree). New: OPML (tree, statement as `_note`), Anki CSV (`#separator:Comma`, front = question title, back = statement, tag = mastery) for confirmed knowledge cards with a statement. Export buttons move into one menu. | Plan M5 exports. |
| Tagging | Batch of up to 30 untagged asks per model call; auto-runs after a recorded ask when ≥ 10 are untagged and a model is configured; "Analyze now" button runs it at once. Output per ask: `domain` + concept names. Asks get `taggedAt` even with zero concepts. Errors are stored (`recording.lastError` shown in the tab), batch retried on the next trigger. | Doc: batch, cost control. |
| Prerequisite graph | Per domain: the first time a domain appears the model generates its graph, required to include the tagged names; later new names extend it (same prompt with the existing graph). Concepts `source: 'generated'`. `level` is not stored: derived as the longest prerequisite chain below a concept. Community / user graphs not built. | "Same domain generated once"; derivable field dropped. |
| Concept ↔ node | Link when a node's title or term equals the concept name (case-insensitive), or, with an embedding model, cosine ≥ 0.85 between concept name and node title. Linking runs after tagging. | Doc: concepts link to note nodes. |
| Signals | Window 14 days. Repeat: concept with ≥ 3 asks across ≥ 2 conversations. Downshift: an ask's concept is a prerequisite ancestor ≥ 2 levels below another concept asked in the same conversation. Circling: ≥ 3 consecutive asks in one conversation with neighbour cosine ≥ 0.8 (needs an embedding model; ask vectors stored on the ask, computed once). | Doc §三类信号; thresholds are constants, tuned later with the eval. |
| Root cause | Score each concept by the weighted symptoms (signal counts) among itself and its prerequisite descendants; keep concepts covering ≥ 2 symptoms or one repeat; pick the highest score, ties to the most specific (highest level). A circling group goes to the model ("one deeper concept explaining all of these?") and its answer becomes a candidate with weight 3. Only top candidates become diagnoses. | Doc §根因推断. |
| Diagnosis lifecycle | Stored `status`: `suspected` / `confirmed` / `dismissed`. `remediated` is derived: confirmed and the linked node passed a review after confirmation. Pass the quiz → dismissed; accept → confirmed; reject → dismissed. A dismissed root concept is not diagnosed again for 30 days, and asks sent before the dismissal never count as its evidence again. | Doc lifecycle with one derived state. |
| Frequency | The automatic pipeline runs at most once per 24 h; at most 3 suspected diagnoses open at once. Never a popup: a count pill on the Learning tab. | Doc §提醒策略. |
| Diagnosis quiz | 3–5 items generated for the root concept (not the user's problems), answered in one form, judged in one call; pass when ≥ 60 % items pass. Stored in `quizzes`. | Doc §小测验. |
| Confirmed | The root concept gets a node (linked one, or a new topic node), marked weak on the map; a one-click "know by heart" suggestion; a systematic review: the model proposes cards from the most basic concept up, kept with the existing organize keep flow under the concept node. | Doc §确认; reuses organize. |
| Testing | Deterministic mock tasks for every new prompt; recorder unit-tested on all 6 real page fixtures (Enter and send button); E2E on a synthetic chat page for the generic rule. Real-model evals (tag accuracy) added to `tests/eval/`. | Plan testing principle. |

## D1: recording the user's questions

- [x] D1.1 Schema v4 `asks`; repository: record, list, delete, clear, exclude conversation. `src/capture/recorder.ts` (site config + generic rule, dedupe) with unit tests on all 6 site pages (Enter and send button), generic textarea / contenteditable, Shift+Enter, IME composition, password input never read.
- [x] D1.2 Recorder content script; background: recording settings, permission-scoped registration, injection into open tabs, gate, badge, `asks/*` messages, separate JSON export.
- [x] D1.3 Learning tab: privacy notice, site ticks, pause, list with search / delete / clear / exclude conversation / export. E2E: generic capture by Enter and by button; paused → zero; not-enabled origin → zero; password field never; screenshot.

## M5: teacher mode

- [x] M5.1 Apply mode for internalize cards (alternating with recall, model-written problem, model judge); north star counts passes of every mode.
- [x] M5.2 Explain it to me: card + subtree explanation judged per node, reviews per node, failed nodes red in the tree.
- [ ] M5.3 One-minute script for a card / subtree, copy button.
- [ ] M5.4 Stats: last 4 weeks of the north star. Exports: tree-ordered Markdown, OPML, Anki CSV, one export menu.

## D2: concept tags and prerequisite graph

- [ ] D2.1 Tables `askTags`, `concepts`, `prereqEdges`; tagging batches (auto at ≥ 10 untagged, manual "Analyze now"); per-domain graph generated once and extended; errors shown in the tab.
- [ ] D2.2 Concept ↔ node linking; concept chips on recorded questions; eval dataset and metric for tag accuracy.

## D3: signals and root cause

- [ ] D3.1 Signal detection (repeat, downshift, circling) as pure functions over asks, tags and the graph; ask vectors cached on the ask; unit tests.
- [ ] D3.2 Root-cause ranking, circling model call, diagnosis creation with dedupe, cool-down and cap; synthetic sequences with known roots, top-3 rate recorded as a baseline test.

## D4: confirmation and presentation

- [ ] D4.1 Diagnosis cards in the Learning tab: hypothesis with evidence (opens the conversation), accurate / inaccurate, accept / reject, 3–5 item quiz judged by the model; pass → withdrawn with cool-down; fail / accept → confirmed with node link, weak mark, "know by heart" suggestion and a systematic review kept as cards.
- [ ] D4.2 Map states on cards (suspected light, confirmed marked, remediated derived); automatic pipeline cadence and cap; E2E end to end on the mock server.

## Final

- [ ] F1 Self-review of the whole diff vs `main` (code-review skill + own pass): bugs, dead code, redundant fallbacks, over-design, naming; fix.
- [ ] F2 Docs: CHANGELOG, README usage, plan and module progress notes, CLAUDE.md if rules changed (recorder is the one always-on script).
- [ ] F3 `npm run check` green; fast-forward `main`; push `main` and this branch.

## Log

Short notes on deviations and why, newest last.

- D1.1: A send is confirmed only when the input is cleared or changed within 2 s (or the input is detached). This one check rejects Enter while the site refuses to send and clicks on non-send buttons near the box, so the generic rule can treat any button near an editable as a candidate. Generic button reach: in its form, else the nearest editable within 4 ancestors.
- D1.2: The recorder is re-registered on install/update; registered scripts persist across restarts, so a worker wake does no work.
- D1.3: Unticking a site does not remove its host permission (Chrome refuses to remove a required one in the E2E build, and the recorder is already unregistered). Access is still requested only at the moment a site is ticked. The "this site" option is the active tab's origin when no site config covers it.
- M5.1: The apply problem is plain text (no JSON); it is kept as the review's prompt. Apply is judged by the model only (there is no stored answer to reveal for self-grading); the statement is shown after judging.
- M5.2: "Explain it to me" is offered on kept knowledge and topic cards (a topic's branch is explained through its kept children); at most 20 kept cards per explanation. A card shows "missed last check" when its latest review in any mode is fail or partial. NodeView gained `lastVerdict`.
