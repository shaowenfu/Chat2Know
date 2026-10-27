# Chat2Know

**Everything you chatted about, you can explain.** · 聊过的，都能讲出来。

Chat2Know is a browser extension that sits on top of any AI chat client as a knowledge layer: it captures, distills, organizes and **verifies** what you learn from AI conversations, so you can still explain it after you close the tab.

Chat2Know 是一个浏览器插件：叠在所有 AI 客户端之上的"知识层"，负责捕获、蒸馏、组织和检验对话中的知识。

> Status: early development (M4 done). Usable for daily dogfooding; expect changes.

## Try it locally

Requires Node.js 22+.

```bash
git clone https://github.com/shaowenfu/Chat2Know.git
cd Chat2Know
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick `.output/chrome-mv3`. After pulling updates, run `npm install && npm run build` again and click the reload button on the extension card.

### Using it

1. Click the Chat2Know toolbar icon to open the side panel. Open **⚙ Model settings** and enter any OpenAI-compatible endpoint: base URL, model and API key (an embedding model is optional and enables placement suggestions). Capturing works without a model.
2. Select text on the page and click **Save** (knowledge) or **Idea** in the floating toolbar. Alternatively press **Alt+Shift+K** / **Alt+Shift+I**, or right-click → *Save to Chat2Know*.
3. Hit a term you don't fully get? Select it and click **Ask later** (or press **Alt+Q**), optionally type your question, and keep reading. Work through the **Ask later** tab in the side panel when you're done; **Copy follow-up** gives you a ready-to-paste question for the chat.
   Need it right away? **Ask now** answers in the side panel without touching the page.
4. In **Ask later**, click **Ask here** for an answer. Answers wait in an inbox for 7 days; click **Keep** and choose a question to review it by and a short statement to keep. Anything you don't keep just expires.
5. In **Cards**, pick one of the proposed questions as the title, drag cards into a tree, switch to **Conclusions** for an outline, or **Organize page** / **Organize pasted text** to turn a whole conversation into candidate cards.
6. Mark what you must **know by heart** and use **Quiz me**. The number of such cards you pass each week is what Chat2Know optimizes for.
7. Export everything as JSON or Markdown at any time; import JSON to restore.

Your data stays in your browser. The only thing that leaves it is the text you ask about or organize, sent to the model provider you configured, with your own key. No telemetry.

## Docs

- [Project plan (中文)](docs/project-plan.md)
- [Contributing](CONTRIBUTING.md)

## License

[AGPL-3.0-or-later](LICENSE). "Chat2Know" is a trademark of the project maintainer.
