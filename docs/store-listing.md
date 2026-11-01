# Chrome Web Store listing (draft)

Text to paste into the Chrome Web Store developer dashboard when submitting a release. The package is the `chat2know-<version>-chrome.zip` attached to each GitHub release (or `npm run zip`). Store screenshots are 1280×800 or 640×400; take them from a real session (the side panel next to an AI chat).

## Store listing

**Name:** Chat2Know

**Summary (≤ 132 characters):**
A knowledge map for what you learn from AI chats: one click puts a formula or conclusion in the right place on your map.

**Description:**

Chat2Know is a knowledge map for people who learn by chatting with an AI (ChatGPT, Claude, Gemini, DeepSeek, Kimi, Doubao). One click records a formula or a conclusion, and Chat2Know files it on that subject's map: subject › chapter › topic.

- One click: on the sites you tick, a ＋ sits beside every formula in an answer. On any page, select text and press Alt+S or right-click.
- In the right place: with your model, each note moves to its subject and topic, and a long selection becomes one sentence. Move or undo from the toast; your corrections teach it.
- See what you have covered: lay out a course's outline (or your textbook's table of contents) in grey; the less grey, the more you have learned.
- See what is missing (optional, off by default): Chat2Know can match the questions you send to your map and outline in orange the topic you keep coming back to. At most once a day it asks whether to add that part's core formulas, or to try one question.
- Formulas stay exact (LaTeX), every note jumps back to its conversation, and the map exports to JSON, Markdown and OPML.

Local-first: no account, no server, no analytics. Bring your own OpenAI-compatible model and key; recording works without one. Open source (AGPL-3.0): https://github.com/shaowenfu/Chat2Know

**Category:** Productivity (alternative: Education)
**Language:** English; Chinese (Simplified) is included in the package.

## Privacy practices tab

**Single purpose:**
Record formulas and conclusions from AI conversations into a knowledge map in the side panel.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The map lives in the browser side panel. |
| `storage` | Stores the user's model settings (endpoint, model, API key), ticked sites and preferences locally. |
| `activeTab` | Records the selected text only on the tab where the user pressed the shortcut or used the context menu. |
| `scripting` | Injects the recording script into that tab on demand; registers the site script (＋ beside formulas) only on sites the user ticks. |
| `contextMenus` | "Add to Chat2Know map" entry for selected text. |
| `alarms` | When the user turned on question recording: looks at the recorded questions ten minutes after a conversation goes quiet. |
| Optional host permissions (`https://*/*`, `http://*/*`) | Requested at runtime for exactly one origin at a time: the AI model endpoint the user enters in settings, and each AI chat site the user ticks. Nothing is requested at install. |

**Remote code:** No. All code is in the package.

**Data usage:** answer according to [PRIVACY.md](../PRIVACY.md):

- Collected and stored locally only: website content the user records ("Website content"), and, only if the user turns on question recording, the questions the user sends on the ticked sites ("User activity").
- Not sold, not transferred to third parties, not used for unrelated purposes or creditworthiness.
- The only transfer is to the AI model endpoint the user configures, with the user's own key, to place recorded notes, propose outlines and find gaps.

**Privacy policy URL:** https://github.com/shaowenfu/Chat2Know/blob/main/PRIVACY.md
