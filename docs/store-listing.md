# Chrome Web Store listing (draft)

Text to paste into the Chrome Web Store developer dashboard when submitting a release. The package is the `chat2know-<version>-chrome.zip` attached to each GitHub release (or `npm run zip`). Store screenshots are 1280×800 or 640×400; take them from a real session (the side panel next to an AI chat).

## Store listing

**Name:** Chat2Know

**Summary (≤ 132 characters):**
Turn AI conversations into knowledge you can explain: capture, ask later, keep what matters, and verify it with quizzes.

**Description:**

Chat2Know is a knowledge layer on top of any AI chat client (ChatGPT, Claude, Gemini, DeepSeek, Kimi, Doubao and more). It helps you keep what you learn from AI conversations and makes sure you can still explain it later.

- Capture: select text on any page and save it. Formulas, code and tables are kept.
- Ask later: hit a term you don't know, queue the question and keep reading. Answer it in the side panel when you're ready; only what is worth reusing becomes a card.
- Organize: question-titled cards in a tree, a conclusions outline, organize a whole conversation at once.
- Verify: mark what you must know by heart, then Quiz me (recall and "use it" problems), Explain it to me, and a one-minute script. Spaced repetition included.
- Learning (optional, off by default): on the AI sites you choose, Chat2Know notices repeated, circling or below-the-topic questions and suggests which foundation is worth a systematic review.
- Export to JSON, Markdown, OPML (mind maps) and Anki.

Local-first: no account, no server, no analytics. Bring your own OpenAI-compatible model and key; your data stays in your browser. Open source (AGPL-3.0): https://github.com/shaowenfu/Chat2Know

**Category:** Productivity (alternative: Education)
**Language:** English; Chinese (Simplified) is included in the package.

## Privacy practices tab

**Single purpose:**
Help the user capture, organize and verify knowledge from AI conversations and web pages in a side panel.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The whole user interface lives in the browser side panel. |
| `storage` | Stores the user's model settings (endpoint, model, API key) and recording settings locally. |
| `activeTab` | Shows the selection toolbar and captures the selected text only on the tab where the user invoked the extension (icon, shortcut or context menu). |
| `scripting` | Injects the capture script into that tab on demand; registers the optional question recorder only on sites the user ticks in the Learning tab. |
| `contextMenus` | "Save to Chat2Know" and "Ask later" entries for selected text. |
| Optional host permissions (`https://*/*`, `http://*/*`) | Requested at runtime for exactly one origin at a time: the AI model endpoint the user enters in settings, and each AI chat site the user ticks for the optional Learning feature. Nothing is requested at install. |

**Remote code:** No. All code is in the package.

**Data usage:** answer according to [PRIVACY.md](../PRIVACY.md):

- Collected and stored locally only: website content the user selects ("Website content"), and, only if the user enables Learning on a site, the questions the user sends there ("User activity").
- Not sold, not transferred to third parties, not used for unrelated purposes or creditworthiness.
- The only transfer is to the AI model endpoint the user configures, with the user's own key, to provide the features the user invokes.

**Privacy policy URL:** https://github.com/shaowenfu/Chat2Know/blob/main/PRIVACY.md
