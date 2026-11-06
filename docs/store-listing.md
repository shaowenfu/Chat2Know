# Chrome Web Store listing (draft)

Text to paste into the Chrome Web Store developer dashboard when submitting a release. The package is the `chat2know-<version>-chrome.zip` attached to each GitHub release (or `npm run zip`). Store screenshots are 1280×800 or 640×400; take them from a real session (the side panel next to an AI chat).

## Store listing

**Name:** Chat2Know

**Summary (≤ 132 characters):**
Learn by chatting with AI: one click puts what you select on your knowledge map, and gentle hints help when you are stuck.

**Description:**

Chat2Know is a knowledge map and a question coach for people who learn by chatting with an AI (ChatGPT, Claude, Gemini, DeepSeek, Kimi, Doubao).

- One click: select a few words of an answer and a small bar appears. Note records it compressed to one sentence or a formula; Keep words keeps the exact words, never rewritten; Ask opens a small window to ask about the selection right there. A ＋ also sits beside display formulas, and on any page Alt+S or the right-click menu records the selection.
- In the right place: you create a map per subject and open it; everything you record goes into that map, and your model files each note under its chapter and topic. Move or undo from the toast; your corrections teach it. Chat2Know never creates or switches maps on its own.
- See what you have covered: edit the map like a mind map, and lay out a course's outline (or your textbook's table of contents) in grey; the less grey, the more you have learned.
- Get unstuck sooner: every 5 questions you send in a map, your model looks at the latest ones. When you seem to be going in circles, the side panel suggests where you may be stuck, what to get clear first and a better question to ask. Nothing appears on the chat page.
- Questions and reports: a full-page log of your questions, and, when you ask for it, a written analysis of a map's questions and what to learn next. No scores, no quizzes.
- Formulas stay exact (LaTeX), every note jumps back to its conversation, and maps export to JSON, Markdown and OPML. Interface and prompts in English and Chinese.

Local-first: no account, no server, no analytics. Bring your own OpenAI-compatible model and key; recording works without one. Question recording is on by default and can be turned off at any time. Open source (AGPL-3.0): https://github.com/shaowenfu/Chat2Know

**Category:** Productivity (alternative: Education)
**Language:** English; Chinese (Simplified) is included in the package.

## Privacy practices tab

**Single purpose:**
Help people learn from AI conversations: record what they select into a knowledge map in the side panel, and point out, from their own questions, where they may be stuck.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The map and the stuck hints live in the browser side panel. |
| `storage` | Stores the user's model settings (endpoint, model, API key), ticked sites and preferences locally. |
| `activeTab` | Records the selected text only on the tab where the user pressed the shortcut or used the context menu. |
| `scripting` | Injects the recording script into that tab on demand; registers the site script (the bar over a selection, the ＋ beside formulas, the Ask window, question recording) only on sites the user ticks. |
| `contextMenus` | "Add to Chat2Know map" and "Keep word for word" entries for selected text. |
| Optional host permissions (`https://*/*`, `http://*/*`) | Requested at runtime for exactly one origin at a time: the AI model endpoint the user enters in settings, and each AI chat site the user ticks. Nothing is requested at install. |

**Remote code:** No. All code is in the package.

**Data usage:** answer according to [PRIVACY.md](../PRIVACY.md):

- Collected and stored locally only: website content the user records ("Website content"), and, unless the user turns question recording off (it is on by default and shows a REC badge), the questions the user sends on the ticked sites and in the Ask window ("User activity").
- Not sold, not transferred to third parties, not used for unrelated purposes or creditworthiness.
- The only transfer is to the AI model endpoint the user configures, with the user's own key, to place recorded notes, propose outlines, answer questions about a selection and notice when the user is stuck.

**Privacy policy URL:** https://github.com/shaowenfu/Chat2Know/blob/main/PRIVACY.md
