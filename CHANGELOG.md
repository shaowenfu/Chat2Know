# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Learning diagnosis (D1–D4), off until you tick a site:
  - Record the questions you send on ChatGPT, Claude, Gemini, DeepSeek, Kimi, Doubao or any other site you tick (a generic rule covers the rest). Access is asked for each ticked site only; a REC badge shows while recording; pause, exclude a conversation, search, delete and export in the new **Learning** tab. Password and other `input` fields are never read.
  - Questions are tagged with concepts in batches; each domain gets a prerequisite graph once, extended as new concepts appear; concepts link to your cards.
  - Gaps are inferred from three signals (asked again and again, basics asked during harder work, going in circles) and the concept that explains most of them. At most three open at once, at most one automatic pass a day, a rejected one rests for 30 days.
  - Each suspected gap shows your own questions as evidence (linked back to the conversation). Confirm it with a short quiz or say whether it is accurate. A confirmed gap is marked on the map and gets a systematic review, kept as cards to know by heart; passing them marks it strengthened.
- M5 teacher mode:
  - Quiz me alternates recall with **use it**: a short problem the model writes, judged as a solution.
  - **Explain it to me** on any kept card: the model checks your explanation of the card and its branch, card by card; missed cards are marked on the map.
  - **Explain it in one minute**: a script to say out loud, from the branch's statements.
  - Stats show the north star for the three weeks before this one.
  - Exports in one menu: Markdown (now in tree order), OPML and Anki CSV.
- M4 semantic help and organizing:
  - Placement suggestions after keeping a card (top 3 similar cards as parents) and a merge offer for near-duplicate concepts, using the provider's embedding model when one is set.
  - Default mastery suggestion (know by heart / understand / know where to find) by a simple rule, and a "know it by heart?" prompt for terms asked three times.
  - The keep suggestion learns from earlier keep / drop decisions.
  - Organize a whole page or pasted text: the model proposes cards with verbatim quotes; review once and keep.
  - `npm run eval` measures suggestion, placement, mastery and organize quality against a real model.
- M3 minimal quiz, tree and ask now:
  - Mastery choice on cards and **Quiz me**: answer from memory, reveal and grade yourself or let the model judge; spaced repetition; local stats with the north star (cards mastered this week).
  - Card tree with drag and drop (nest, reorder, move to top level), and a conclusions outline view.
  - **Ask now** from the selection toolbar answers in the side panel without touching the page; **Follow up** on answers and cards creates child questions.
- M2 model and ask/keep separation:
  - Model settings: any OpenAI-compatible endpoint (base URL, model, API key, optional embedding model), connection test, host permission requested per origin.
  - Answer queued questions in the side panel. Answers stay in a 7-day inbox; nothing enters the knowledge graph until you keep it.
  - Keep flow: the model classifies the question (concept / instance / curiosity), proposes three review questions plus your own, and a short statement; instances hang under their concept.
  - Captured knowledge is distilled in the background into a statement and three title candidates; failures show with a retry, the raw text is always kept.
- Data: schema v3 (inbox links to its question, review indexes); preferences included in JSON export.

### Fixed

- The "missed last check" mark and the stats panel read the review history once per refresh instead of several times.

- Capture on real chat sites (checked against ChatGPT, Claude, Gemini, DeepSeek, Doubao and Kimi pages saved 2026-10):
  - Formulas keep their LaTeX when the site stores it in an attribute (`data-math-source`, `data-math`, `copy-text`), including formulas drawn as SVG.
  - ChatGPT code blocks keep their line breaks and language.
  - Code block languages shown in a header bar are kept on the fence, and the header's "Copy" / "Download" / "Run" labels no longer leak into the text.
  - Formulas on pages that keep no LaTeX source (Kimi) are rebuilt from the rendered KaTeX: fractions, scripts, limits, roots, matrices, accents.
  - Tables whose header is drawn as a separate sticky table (Kimi) come out as one table.
- The selection toolbar now really hides (it stayed on screen with stale content), and a status message no longer hides the next toolbar.

- Ask later (M1, no AI, no network):
  - "Ask later" button, Alt+Q shortcut and right-click menu. The selection is expanded to its full sentence with `Intl.Segmenter` (Chinese, English and mixed text).
  - One-line question prompt with quick options (What is…? Why…? How is it different from…? What role does it play here?). Enter saves; Esc saves now so the question can be written later.
  - The term gets a faint underline on the page, restored after reload.
  - "Ask later" queue in the side panel: write or edit the question, copy a follow-up to paste into the chat, remove. Asking about the same term again merges into one question and shows how many times it was asked.
- Database schema v2: question titles, original ask, mastery, ask count, inbox and preferences tables. Existing data and v1 exports migrate automatically.

- M1 capture without AI:
  - Selection toolbar (Save / Idea), keyboard shortcuts (Alt+Shift+K, Alt+Shift+I) and right-click menu.
  - HTML to Markdown that restores KaTeX/MathJax/MathML to LaTeX, keeps code block languages and converts tables.
  - Local storage in IndexedDB (Dexie) through a repository layer that appends every write to an oplog.
  - Side panel card list with live updates and soft delete.
  - Jump back to the source page with the quote highlighted (Text Fragment plus our own anchoring).
  - Export to JSON and Markdown; import from JSON (lossless round trip).

- M0 skeleton: WXT + Vue 3 + TypeScript extension with side panel, background service worker and on-demand content script.
- Typed message protocol between content script, background and side panel.
- i18n with English (default) and Simplified Chinese.
- `npm run check`: typecheck, lint, unit tests, build and Playwright E2E with the extension loaded in headless Chromium.
