# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

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
