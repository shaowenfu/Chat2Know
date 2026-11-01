# Chat2Know

**A knowledge map for your notes: one click puts a formula from your AI chat in the right place.** · 和 AI 聊天时，点一下就把公式或结论记到知识导图里合适的位置。

Chat2Know is a browser extension for people who learn by chatting with an AI. While you read an answer, a ＋ sits beside every formula; one click records it, and Chat2Know files it on that subject's map (subject › chapter › topic). Over time the map shows what you have covered, and, if you let it, which parts you keep coming back to.

Chat2Know 是一个浏览器插件：在 AI 对话里看到值得记的公式或结论，点一下就行，放到哪里由插件来定。导图会告诉你一门课学到了哪里、哪一块还缺。

> Status: 0.2.0 in development on this branch (`v2`), a rebuild of 0.1. The released 0.1.0 is on `main`. Chrome and other Chromium browsers (Edge, Brave, Arc); Firefox is not supported yet.

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

1. Click the Chat2Know icon to open the side panel and tick the AI sites you use (ChatGPT, Claude, Gemini, DeepSeek, Kimi, 豆包). The browser asks for access to each ticked site only.
2. In an answer on those sites, click the **＋** beside a formula. It shows **Added**, and a toast says where it went, with **Move** and **Undo**. On any page, select text and press **Alt+S** (or right-click → *Add to Chat2Know map*): one formula selected becomes a formula, anything else a one-sentence statement.
3. Set up a model (any OpenAI-compatible endpoint: base URL, model, key; an embedding model is optional and places notes more accurately) in **Settings** (the side panel's *Set up a model* link, or ⚙ on the full map). With a model, each note moves to its subject and topic, new topics are created as needed, and a long selection becomes one sentence. Without one, notes wait in **Unplaced** and you drag them where they belong. Recording never waits for a model.
4. The side panel is the map: switch subjects, fold chapters, drag items onto topics, right-click to move, edit or delete, Ctrl+Z to undo. Click an item to jump back to the conversation. **Full map ↗** opens a full page with a detail pane per topic, where you can also add a formula or statement by hand.
5. After a subject's first note, Chat2Know offers once to lay out the course's outline, or your textbook's table of contents, as grey topics. Grey means "not learned yet"; the less grey, the more of the course you have covered.
6. Optional: **Also record the questions I send on these sites** (settings). Chat2Know then matches your questions to the map's topics. A topic you keep coming back to is outlined in orange, and at most once a day the side panel asks about one: add its core formulas and statements (light blue, you can untick any), try one question, or say no for 30 days.
7. Export the map as JSON, Markdown or OPML (mind-map apps); import a JSON export, or your 0.1 data.

Your data stays in your browser. The only thing that leaves it is what a model call needs, sent to the provider you configured, with your own key. No account, no server, no telemetry. Details: [PRIVACY.md](PRIVACY.md).

## Docs

- [Install guide with screenshots (中文 / English)](docs/install.md)
- [Moving from 0.1](docs/migration-v0.1.md)
- [Privacy policy](PRIVACY.md)
- [Project plan (中文)](docs/project-plan.md)
- [v0.1 docs (archived)](docs/archive-v0.1/)
- [Contributing](CONTRIBUTING.md)

## License

[AGPL-3.0-or-later](LICENSE). "Chat2Know" is a trademark of the project maintainer.
