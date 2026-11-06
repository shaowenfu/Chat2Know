# Chat2Know

**A knowledge map for your notes and a coach for your questions, while you learn by chatting with an AI.** · 和 AI 聊天学习时，一边把要点记进知识导图，一边帮你发现自己卡在哪里。

Select something in an AI answer and one click records it in the right place on the map you opened, keeps it word for word, or asks about it right there. Chat2Know also listens to the questions you send: when you seem to be going in circles, the side panel suggests where you may be stuck and a better question to ask.

选中 AI 回答里的一段：点一下记进你打开的导图（放到哪里由插件来定），或一字不改地保存，或就地提问。插件也会看你发出的提问：像是在绕圈子时，侧栏会温和地告诉你可能卡在哪、先弄清什么、怎么问更好。

> Status: 0.2.0, a rebuild of 0.1, is on the `v2` branch and in its final trial. The released 0.1.0 is on `main`. Chrome and other Chromium browsers (Edge, Brave, Arc); Firefox is not supported yet. Interface and model prompts in 中文 and English.

## Install

**Download** (no developer tools needed): get `chat2know-<version>-chrome.zip` from the [latest release](https://github.com/shaowenfu/Chat2Know/releases/latest), unzip it into a folder you keep, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder.

**Or build from source** (Node.js 22+):

```bash
git clone https://github.com/shaowenfu/Chat2Know.git
cd Chat2Know
git checkout v2
npm install
npm run build   # then Load unpacked: .output/chrome-mv3
```

Step-by-step guide with screenshots (中文 / English): [docs/install.md](docs/install.md). Coming from 0.1: [docs/migration-v0.1.md](docs/migration-v0.1.md).

## Using it

1. **First screen.** Click the Chat2Know icon to open the side panel. It asks for three things: ① your model (any OpenAI-compatible endpoint: base URL, model, key; an embedding model is optional, under *Advanced*), ② the AI sites you use (ChatGPT, Claude, Gemini, DeepSeek, Kimi, 豆包; the browser asks for each one you tick), ③ your first map. Switch between 中文 and English at the top.
2. **Maps are yours.** Create a map per subject or topic (a name is optional) and open it from the switcher at the top of the side panel. Everything you record goes into the open map until you open another. Chat2Know never creates, switches or renames a map on its own; a map you left unnamed is named once from its first notes.
3. **Select, then choose.** On a ticked site, select a few words of an answer and a small bar appears above them:
   - **Note** records it, compressed: one formula selected stays a formula, anything else becomes one sentence (a bare term becomes "term: a one-line explanation").
   - **Keep words** records a protected quote: the exact words, never rewritten. The model only chooses its place; only you can edit it. It shows with a purple border and a serif face.
   - **Ask** opens a small window beside the selection: ask a short question about it, the answer streams in, follow up if you like. Add a useful answer to the map or keep it word for word; the conversation itself is not kept.
   
   A ＋ also sits beside display formulas. On any other page, select text and press **Alt+S**, or right-click → *Add to Chat2Know map* / *Keep word for word*.
4. **It lands in the right place.** A note appears at once (where this conversation's last note went, or in the map's *Unplaced* group), then the model moves it to its chapter and topic, creating them as needed. The toast says where, with **Move** and **Undo**; your corrections teach later placements. Without a model, notes wait in *Unplaced* for you to drag them into place.
5. **The map.** The side panel shows the open map: fold chapters, drag items, double-click to edit, Enter for a new topic, Tab / Shift+Tab to change level, Delete to delete, Ctrl+Z to undo. Clicking an item selects it; its small ↗ jumps back to the conversation. **Full map ↗** opens a full page with a detail pane per topic. Once a map has a name and its first note, Chat2Know offers once to lay out the course's outline (or your textbook's table of contents) in grey: grey means "not learned yet".
6. **Getting unstuck.** The questions you send on the ticked sites and in the Ask window are recorded into the map open at the time (on by default; turn it off on the first screen or in settings; a REC badge shows while it is on). Every 5 new questions in a map, the model reads its latest 30. If you seem to be going in circles, held up by an earlier topic, asking off target or struggling to phrase the question, the side panel shows one gentle card: where you may be stuck, what to get clear first, and a better question to copy. The topic it names is outlined in orange. *Not now* keeps that map quiet for the day. Nothing appears on the chat page.
7. **Questions and reports.** The full page's **Questions** tab lists every recorded question (search, filter by map, delete). **New report** has the model write an analysis of a map's questions: what you have been asking about, what has landed and what has not, your questioning habits with a way to improve each, and what to learn next. Reports are kept with their history. No scores, ever.
8. **Export** a map as JSON (lossless), Markdown (protected quotes as quotations) or OPML for mind-map apps; import a JSON export.

Your data stays in your browser. What leaves it is only what a model call needs, sent to the provider you configured, with your own key. No account, no server, no telemetry. Details: [PRIVACY.md](PRIVACY.md).

## Docs

- [Install guide with screenshots (中文 / English)](docs/install.md)
- [Moving from 0.1](docs/migration-v0.1.md)
- [Privacy policy](PRIVACY.md)
- [Changelog](CHANGELOG.md)
- [Project plan (中文)](docs/project-plan.md)
- [v0.1 docs (archived)](docs/archive-v0.1/)
- [Contributing](CONTRIBUTING.md)

## License

[AGPL-3.0-or-later](LICENSE). "Chat2Know" is a trademark of the project maintainer.
