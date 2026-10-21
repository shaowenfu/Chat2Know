# Chat2Know

**Everything you chatted about, you can explain.** · 聊过的，都能讲出来。

Chat2Know is a browser extension that sits on top of any AI chat client as a knowledge layer: it captures, distills, organizes and **verifies** what you learn from AI conversations, so you can still explain it after you close the tab.

Chat2Know 是一个浏览器插件：叠在所有 AI 客户端之上的"知识层"，负责捕获、蒸馏、组织和检验对话中的知识。

> Status: early development (M0). Not ready for use yet.

## Try it locally

Requires Node.js 22+.

```bash
git clone https://github.com/shaowenfu/Chat2Know.git
cd Chat2Know
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick `.output/chrome-mv3`. After pulling updates, run `npm install && npm run build` again and click the reload button on the extension card.

## Docs

- [Project plan (中文)](docs/project-plan.md)
- [Contributing](CONTRIBUTING.md)

## License

[AGPL-3.0-or-later](LICENSE). "Chat2Know" is a trademark of the project maintainer.
