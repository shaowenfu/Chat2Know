# Chat2Know

> 下一版正在 [`v2`](https://github.com/shaowenfu/Chat2Know/tree/v2) 分支重构。The next version is being rebuilt on the [`v2`](https://github.com/shaowenfu/Chat2Know/tree/v2) branch.

**Everything you chatted about, you can explain.** · 聊过的，都能讲出来。

Chat2Know is a browser extension that sits on top of any AI chat client as a knowledge layer: it captures, distills, organizes and **verifies** what you learn from AI conversations, so you can still explain it after you close the tab.

Chat2Know 是一个浏览器插件：叠在所有 AI 客户端之上的"知识层"，负责捕获、蒸馏、组织和检验对话中的知识。

> Status: 0.1.0, the first public release. Chrome and other Chromium browsers (Edge, Brave, Arc); Firefox is not supported yet. Usable for daily use; expect changes.

## Install

**Download** (no developer tools needed): get `chat2know-<version>-chrome.zip` from the [latest release](https://github.com/shaowenfu/Chat2Know/releases/latest), unzip it into a folder you keep, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder.

**Or build from source** (Node.js 22+):

```bash
git clone https://github.com/shaowenfu/Chat2Know.git
cd Chat2Know
npm install
npm run build   # then Load unpacked: .output/chrome-mv3
```

Step-by-step guide with screenshots (中文 / English): [docs/install.md](docs/install.md).

## Using it

1. Click the Chat2Know toolbar icon to open the side panel. Open **⚙ Model settings** and enter any OpenAI-compatible endpoint: base URL, model and API key (an embedding model is optional and enables placement suggestions). Capturing works without a model.
2. Select text on the page and click **Save** (knowledge) or **Idea** in the floating toolbar. Alternatively press **Alt+Shift+K** / **Alt+Shift+I**, or right-click → *Save to Chat2Know*.
3. Hit a term you don't fully get? Select it and click **Ask later** (or press **Alt+Q**), optionally type your question, and keep reading. Work through the **Ask later** tab in the side panel when you're done; **Copy follow-up** gives you a ready-to-paste question for the chat.
   Need it right away? **Ask now** answers in the side panel without touching the page.
4. In **Ask later**, click **Ask here** for an answer. Answers wait in an inbox for 7 days; click **Keep** and choose a question to review it by and a short statement to keep. Anything you don't keep just expires.
5. In **Cards**, pick one of the proposed questions as the title, drag cards into a tree, switch to **Conclusions** for an outline, or **Organize page** / **Organize pasted text** to turn a whole conversation into candidate cards.
6. Mark what you must **know by heart** and use **Quiz me**: you recall a card, and on its next round use it to solve a short problem the model writes. On any kept card, **Explain it to me** checks your own explanation of the card and everything under it (missed cards are marked on the map), and **Explain it in one minute** writes a script to say out loud. The number of know-by-heart cards you pass each week is what Chat2Know optimizes for.
7. **Learning** (optional, off by default): tick the AI sites on which Chat2Know may record the questions you send. They stay in your browser; you can pause, exclude a conversation or delete anything. From time to time the questions are tagged with concepts and checked for gaps (the same concept asked again and again, basics asked in the middle of harder work, going in circles). A suspected gap shows its evidence, your own questions; confirm it with a two-minute quiz or say whether it is accurate. A confirmed gap gets a systematic review you can keep as cards to know by heart.
8. **Export ▾** everything as JSON, Markdown, OPML (mind maps) or Anki CSV; import JSON to restore. Recorded questions have their own export in the Learning tab.

Your data stays in your browser. The only thing that leaves it is the text you ask about, organize, check or analyze, sent to the model provider you configured, with your own key. No telemetry. Details: [PRIVACY.md](PRIVACY.md).

## Docs

- [Install guide with screenshots (中文 / English)](docs/install.md)
- [Privacy policy](PRIVACY.md)
- [Project plan (中文)](docs/project-plan.md)
- [Learning diagnosis module (中文)](docs/module-learning-diagnosis.md)
- [Contributing](CONTRIBUTING.md)

## License

[AGPL-3.0-or-later](LICENSE). "Chat2Know" is a trademark of the project maintainer.
