---
id: LR4
status: doing
branch: v2
owner: main engineer (cloud)
---

# LR4: the next stage, S0 → S5, released together as 0.2.0

Single source of truth for this run. If context is lost, re-read this file, `CLAUDE.md`, the plan doc
"Chat2Know 第一轮测试整理与下一阶段开发计划" (https://claude.ai/artifact/3tixrATXtJbfZbixUCucfR) and the design
canvas (https://claude.ai/artifact/YbcpyaNR6aWbC2EvmAAsjr, artboards 9–16 for this stage), then continue from the
first unchecked box.

Decided by the owner (2026-11-02): one release at the end (0.2.0); ＋ beside formulas stays but is not
introduced on the first screen; floating-window answers are not kept; question recording is on by default;
stuck guidance only in the side panel; the 5-question check replaces the gap flow (orange marks stay);
reports are Markdown text analysis, no ability map; first-screen animation direction A; protected quotes
differ only by a purple border (#7A4FB5) and a serif font; v0.1 import is removed; maps are created and
opened by the user only.

Each step: `npm run check` green, screenshots compared with the artboards, one commit on `v2` with this file
updated, pushed.

## S0: groundwork and polish

- [x] S0.1 Maps created and opened by the user (need F): the open map in settings; recording goes into it; placement only inside it (an unnamed map is named once from its content); no map open → the toast offers "新建导图并记下"; the side panel's switcher creates (name optional) and opens maps. Remove v0.1 import, automatic subjects and cross-subject placement.
- [x] S0.2 Language: a switch (follow the browser / 中文 / English) in the first screen and settings; UI strings from bundled locale files; placement and outline prompts in both languages; singular / plural counts.
- [x] S0.3 Outline quality: prompt with a real example per language, validation (language of the titles, no generic titles), eval cases; a bare term is recorded as "term: one-sentence explanation".
- [x] S0.4 First screen (artboard 9) with animation A, the permission note before saving a model, question recording on by default.
- [ ] S0.5 Map editing in the side panel and the full page: double-click to edit, new child, add item, Delete, Enter (new sibling), Tab / Shift+Tab; items jump back to the conversation only through a ↗ button.

## S1–S5

- [ ] S1 Selection layer (记下 / 保护原文 / 提问 greyed) and protected quotes.
- [ ] S2 Floating question window.
- [ ] S3 Question recording per open map and the stuck check every 5 questions (replaces the gap flow).
- [ ] S4 Question log page and Markdown reports.
- [ ] S5 README, privacy, store listing, install guide; owner's one-week trial; merge into `main`, release 0.2.0.

## Log
- S0.1: The open map is `openMap` in `chrome.storage.local` (`src/sites/open-map.ts`), set only by the user (switcher, creating a map, or "新建导图并记下" on the page toast). `recordItem` takes the open map and returns `noMap` without one; dedupe is per map. Placement sees only the item's map (outline, candidates, the user's corrections in that map) and answers `{path, statement, mapName}`; `fileItem` never leaves the map and renames it only when its title is empty (an undo of that record takes the name back too). The 改位置 picker offers places in the item's map; search reaches every map (a user's move). Removed: v0.1 import (IndexedDB and file), the "Untitled subject" logic, cross-subject placement, `importItems`. The placement prompt already exists in both languages (`lang` from the browser's UI language until S0.2 adds the switch) and asks for "term: explanation" for a bare term (part of S0.3). The placement eval now measures topic accuracy within the right map and whether an unnamed map gets its subject's name. An empty map counts as grey, so the Markdown / OPML export leaves it out. Screenshot `11-map-switcher.png` matches artboard 11.
- S0.2: Locale files moved from YAML to JSON (`locales/*.json`; converting showed YAML 1.1 had turned `no:` keys into `false`, now caught by the locale test, which also checks every `$n` survives translation). `src/i18n` bundles both and answers `i18n.t` in the chosen language (`uiLang` in storage: follow the browser, 中文, English); WXT's `#i18n` remains only for its key types and the manifest. Pages reload on a change; the content script and background follow it; background handlers wait for the choice to load (`onMessages(…, before)`). Prompts follow the same choice (`promptLang`). `LangSwitch.vue`: a select in the settings header, a 中文 / EN pill for the first screen (S0.4). Counts of 1 read "1 item".
- S0.3: Root cause of the test's "Overview / Scope / History" outline: the offer generated its proposal while the map was still "Untitled subject" (before placement renamed it to 高等数学) and cached it. Now an unnamed map gets no offer (S0.1), and a proposal is kept with the name it was made for (`forTitle`) and redone when the map is renamed. The outline prompt exists in both languages with a real example (the first chapters of 高等数学 / Calculus) and forbids titles that fit any subject; `parseOutline` rejects an outline whose titles are more than a quarter generic or not in the script of the map's name, so the card shows the error instead of a template. Eval: `data/outlines.json` (5 subjects, `outlineValid`, `outlineCoverage`) and a bare-term placement case (`termsExplained`; the placement prompt asks for "term: explanation" since S0.1).
- S0.4: `FirstScreen.vue` replaces the old empty state (artboard 9): headline and body rewritten around selecting and getting unstuck (no more "formulas get a ＋"), animation A (`GrowthAnimation.vue`, CSS only, last frame under reduced motion), ① `ModelForm.vue` (shared with settings; compact mode = one "save and test" button, embedding model folded under "Advanced"; the permission note is shown before saving, in both places), ② sites + question recording (now on by default), ③ create the first map (name optional). The import of 0.1 data is gone from it. Screenshot `9-first-screen.png` matches the artboard.
