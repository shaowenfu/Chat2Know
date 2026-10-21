# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

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
