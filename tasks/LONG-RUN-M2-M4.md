---
id: LR1
status: doing
branch: claude/wizardly-ramanujan-nw4ns1
owner: main engineer (cloud)
---

# LR1: Long run M1 → M4

Single source of truth for this run. If context is lost, re-read this file, `CLAUDE.md`
and `docs/project-plan.md`, check `git log`, and continue from the first unchecked box.

## Ground rules (apply to every step)

- **First principles.** Every feature must serve the core flow *ask → keep or not → mastery → verify*
  and the north star (weekly passed *internalize* cards). If it does not, cut it.
- **Occam's razor.** Smallest design that meets the acceptance criteria. No speculative options,
  no abstraction with one implementation, no config nobody asked for.
- **No defensive fallbacks.** Do not swallow errors or invent defaults to hide bugs. Errors
  propagate to the caller and are shown to the user as-is. Only catch where there is a real,
  intended recovery (e.g. a broadcast with no listener).
- **Definition of done per step:** `npm run check` green, screenshots looked at for UI changes,
  one Conventional Commit on this branch. Update this file's checkboxes in the same commit.
- **Final:** self-review (correctness, redundancy, over-design), fix, re-run check,
  fast-forward `main`, push both.

## Decisions fixed up front (do not relitigate during the run)

| Topic | Decision | Why |
| --- | --- | --- |
| Model API | One provider: user-entered **base URL, model, API key**, OpenAI-compatible `POST {base}/chat/completions`, non-streaming. No Ollama, no Anthropic/Gemini adapters. | Product owner decision; nearly every cloud vendor exposes this format. |
| Structured output | Ask for a JSON object, parse strictly, validate shape. Invalid output is an error shown to the user. | No silent fallback. |
| Host permission | Request the base URL's origin as an optional host permission when settings are saved. | Keeps "no read-all-sites" principle. |
| Settings UI | A view inside the side panel, not a separate options page. | One less entrypoint. |
| Key safety | Key only in `chrome.storage.local`, read only in the background, never in DB, logs, exports or error messages. | CLAUDE.md rule. |
| Async distill | No job table. Pending work is derived from data: knowledge nodes in `draft` without `summary`. Failures are stored on the node (`distillError`) and shown with a retry button. | Survives worker sleep without a queue. |
| Inbox | Answers to queued / ask-now questions go to `inbox` with `expiresAt = +7 days`; purged on background start and on each list. Not logged to oplog. | Plan principle 4. |
| Keep flow | "Keep" asks the model for a recording suggestion: `kind` (concept / instance / curiosity), 3 question-title candidates, a 1–3 sentence statement, and for instances the concept name. User picks/edits, then confirms. | Plan §4–5. |
| Title candidates | Same 3-candidates + custom input for captured knowledge cards (no user question). | Product owner decision. |
| Embeddings (M4) | Use the same provider's OpenAI-compatible `POST {base}/embeddings` with an optional *embedding model* setting. No local transformers.js model. | Product owner dropped local models; avoids a 100 MB+ download and an offscreen document. Features needing embeddings are hidden until the setting is filled. |
| Sibling order | `fractional-indexing` package. | Tiny, well known; not worth re-implementing. |
| Quiz scheduling | Fixed-ease doubling: pass → interval ×2.5 (first 1 day), partial → ×1.2, fail → 1 day. Pass sets `mastered`; fail sets back to `confirmed`. | Smallest schedule that behaves like spaced repetition. |
| North star | Distinct nodes with `mastery = internalize` that have a passing review in the last 7 days. | Plan definition. |
| Conclusion view | Same tree, showing statements (`summary`) instead of question titles. No AI regrouping. | Meets "statement outline" without a second model call. |
| Ask now | Toolbar "Ask now" saves an open question and answers it immediately into the inbox. In-panel follow-ups on a node create a child question (`child` + `arose_from` edges). | Host page untouched; answers in our panel. |
| Testing | Local mock LLM server (`tests/mock-llm/`) implementing `/chat/completions` and `/embeddings` deterministically. Real-model evals live in `tests/eval/`, run manually with `EVAL=1`. | Plan testing principle. |

## M2: model + ask/keep separation

- [x] M2.1 Settings view (base URL, model, API key, embedding model optional), permission request, test connection. LLM client in `src/llm/`. Mock LLM server + E2E harness.
- [x] M2.2 Answer a queued question in the panel → inbox item (expires in 7 days, purged). Errors (bad key, offline) shown verbatim; question stays queued.
- [x] M2.3 Keep flow: recording suggestion (concept / instance / curiosity), 3 title candidates + custom, statement summary, instance → `instance_of` edge to a concept node, curiosity → suggest not keeping. Record preferences (accept / edit / delete).
- [x] M2.4 Async distill for captured knowledge cards: summary + 3 title candidates; card stays `draft` until the user picks a title; `distillError` + retry. Capture still stores raw text when the model fails.
- [x] M2.5 Acceptance: E2E full flow on mock server; key never in exports/DB/oplog (assert); concept / instance / curiosity fixtures give the right form.

## M3: minimal quiz, tree, ask now

- [x] M3.1 Mastery selector on cards with everyday labels (must know by heart / understand / know where to find). Quiz view: due internalize cards, answer, reveal, self-grade or AI judge, schedule, `mastered` on pass. Stats: north star this week, due count.
- [x] M3.2 Question tree view (explore) and conclusion view; drag a node onto another to make it a child, reorder persisted with fractional index.
- [x] M3.3 Ask now from the toolbar (inbox answer) and follow-up questions in the panel that create child nodes. Assert host page DOM unchanged (excluding our UI host) during ask now.

## M4: semantic help and organizing

- [x] M4.1 Embeddings via provider (when embedding model set), cached per node+model. Mount recommendation (top-3 parents) when confirming a card. Concept merge prompt above a similarity threshold; merging moves sources, adds askCount, soft-deletes the duplicate.
- [x] M4.2 Mastery suggestion by rule (dependents via child/arose_from edges, askCount ≥ 3) as the selector default; "asked 3 times — must know by heart?" prompt in the queue.
- [x] M4.3 Learn from choices: recent preferences as few-shot examples in the recording-suggestion prompt.
- [x] M4.4 Whole-page organize (content script extracts page Markdown) and paste organize: model splits into Q&A turns and candidate cards; keep / edit / discard each.
- [x] M4.5 Eval harness `tests/eval/` (EVAL=1, real provider from env): mount top-3 hit rate, mastery suggestion accuracy, page split on fixtures. Baseline recorded when the owner runs it.

## Final

- [x] F1 Self-review of the whole diff vs `main`: bugs, dead code, redundant fallbacks, over-design, naming; fix.
- [x] F2 Docs: CHANGELOG, README usage, plan progress notes, CLAUDE.md if rules changed.
- [ ] F3 `npm run check` green; fast-forward `main`; push `main` and this branch.

## Log

Short notes on deviations and why, newest last.

- M2: Added `term`, `titleCandidates`, `distillError` on nodes and `questionNodeId` on inbox items (schema v3). Needed to merge repeat asks, hold title candidates until the user picks, and link answers to questions. Ideas are now saved as `confirmed` (they are never distilled or titled).
- M2: Tree edges are directed parent → child for every kind (`child`, `arose_from`, `instance_of`), one incoming tree edge per node. Keeps M3's tree a single query.
- M3.1: Dropped the unused `ease` field from reviews (fixed-ease schedule). Folded the reviews `createdAt` index into schema v3, which has not shipped yet.
- M3.3: Ask now has no shortcut or context-menu entry (toolbar only); the shortcut slots stay for capture and ask later. A failed ask-now keeps the question in the queue.
- M4.1: Embedding rows store the embedded text (to detect staleness) and a plain number array; dropped the derivable `dim`. Duplicate threshold 0.9 cosine; tune with the eval harness on a real embedding model.
- M4.3: Already delivered in M2.3 (preferences recorded on keep/dismiss; last 8 sent as examples in the suggestion prompt; unit-tested). Whether the model actually stops suggesting deleted info types is a real-model property, measured by the eval harness.
- M4.4: Candidates are transient (not persisted); one model request per pass, input capped at 100k characters with an explicit error. Organized cards are confirmed knowledge with the model's verbatim quote as source (page) or no source (paste).
- M4.5: Harness verified with the mock server only. No real baseline yet: the owner runs `npm run eval` with a real provider and commits results/latest.json. masteryAgreement is against labels written alongside the rule, so it only guards against regressions, not quality.
- F1 review (code-review skill, high, plus my own pass) found and fixed: open questions marked "know by heart" leaking into Quiz me and the north star; ask-now merging into an older question and answering the wrong one; a typed custom title reset by panel refreshes; a slow ask-now answer covering a newer prompt; a distill race making two model calls; a second answer overwriting an already kept card; placement replacing a follow-up's arose_from edge; unbatched embeddings; Esc/click-away on ask-now sending a paid request; drop-on-self error; preferences missing from export. Writing the cancel test exposed two M1 bugs: the toolbar never actually hid (`display:flex` overrode `[hidden]`), and a status message's auto-hide also hid the next toolbar. User-reachable errors now carry i18n keys (`UserError`); internal invariants and provider errors stay verbatim.
