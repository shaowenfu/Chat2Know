# Privacy policy · 隐私说明

Chat2Know is a local-first browser extension. It has no account, no server of its own and no analytics. This page lists everything it stores and everything that leaves your browser.

Chat2Know 是一个本地优先的浏览器插件：没有账号，没有自己的服务器，不做任何统计。下面列出它存了什么、什么会离开你的浏览器。

This describes version 0.2. · 本文对应 0.2 版。

## What is stored, and where · 存了什么，存在哪里

Everything is stored **in your browser only** (IndexedDB and `chrome.storage.local`):

- **Your maps**: the maps you created, their chapters and topics, and the items you record (a formula's LaTeX, a one-sentence statement, or a protected quote word for word), each with where it came from: the page URL, the page title and a few words of text around it.
- **The history of your changes**, so they can be undone, and where Chat2Know placed items and where you moved them (examples for later placements).
- **Embedding vectors** of your topics and items, only if you set an embedding model.
- **Settings**: your model settings, **including your API key** (read only by the extension's background script, never written to logs or exports); the sites you ticked; whether question recording is on; the interface language; which map is open; the outlines Chat2Know proposed.
- **Your questions**, unless you turn off *Also record the questions I send on these sites* (it is on by default): the questions you send on the ticked sites and in the Ask window, each with the time, the site, the conversation's URL and the map open when you sent it; what each stuck check found (whether you seemed stuck, the topic, the explanation and the suggested question); and the reports you asked for.

The Ask window's conversation (your questions' answers) is **not** stored: it is gone when you close the window, unless you add an answer to the map yourself.

所有数据**只存在你的浏览器里**（IndexedDB 和 `chrome.storage.local`）：

- **你的导图**：你新建的导图、章和知识点，以及你记下的条目（公式的 LaTeX、一句话结论，或一字不改的原文），每条带出处：网址、页面标题和前后几个字。
- **修改历史**（用于撤销），以及插件把条目放在哪里、你又改到哪里（作为以后归位的示例）。
- **向量**：只有配置了嵌入模型时，才有知识点和条目的向量。
- **设置**：模型设置（**包括 API Key**，只有插件后台读取，不写入日志和导出）、勾选的网站、是否记录提问、界面语言、当前打开的导图、插件提议过的大纲。
- **你的提问**（除非你关掉"也记录我在这些网站上发出的提问"，默认开启）：你在勾选网站上和浮窗里发出的提问，每条带时间、网站、对话网址和发问时打开的导图；每次卡住检查的结果（是否像是卡住、哪个知识点、说明和建议的问法）；以及你生成的分析报告。

浮窗里的对话（模型的回答）**不保存**，关掉浮窗就没有了，除非你自己把某个回答记到导图里。

## What leaves your browser · 什么会离开你的浏览器

Only requests to **the model provider you configure yourself** (any OpenAI-compatible endpoint), sent with your own key. Without a model set up, nothing leaves your browser. With one:

| When | Sent to your model provider |
| --- | --- |
| You record an item (automatic placement) | The item (and the request you typed after Note, if any), a few words of the conversation around it, the open map's name, its chapters and topics, and the last placements you corrected in it |
| Embedding model set | The item's text, and the map's topic titles with a few of their items |
| A named map gets its first note (outline offer) | The map's name, its existing topic titles, and a table of contents if you paste one |
| You open "Move" on a recorded item, with an embedding model | The item's text |
| You ask in the Ask window | The selected text, a few sentences around it, the page title, your question, and the earlier questions and answers in that window |
| Question recording is on, every 5 new questions in a map | That map's latest 30 questions (with which conversation each came from and whether it was asked in the Ask window), its name and its topic titles |
| You click "New report" on the Questions tab | That map's latest 200 questions (with when, where and in which conversation each was asked), its name, its topic titles with how many notes each holds, and what the stuck checks noticed |
| You click "Test connection" | A fixed test message |

Nothing is sent to the Chat2Know project or any third party.

只有发往**你自己配置的模型服务商**的请求（任意兼容 OpenAI 格式的接口，用你自己的 Key）。没有配置模型时，什么都不会离开浏览器。配置之后：

- 记下条目时（自动归位）：该条目（以及点"记下"后你写的要求，如果有）、它前后的几个字、当前导图的名称和章节知识点标题、你在这张导图里最近改过的归位。
- 配置了嵌入模型时：条目文字，以及导图的知识点标题和其下几条条目。
- 有名字的导图记下第一条后（提议大纲）：导图名称、已有知识点标题、你粘贴的目录。
- 打开"改位置"且配置了嵌入模型时：条目文字。
- 在浮窗里提问时：选中的文字、前后几句、页面标题、你的问题，以及这个浮窗里之前的问答。
- 提问记录开着时，一张导图每满 5 条新提问：它最近 30 条提问（标明来自哪段对话、是否在浮窗里问的）、导图名称和知识点标题。
- 在"提问"页点"生成新报告"时：这张导图最近 200 条提问（含时间、网站和所属对话）、导图名称、知识点标题及其笔记数，以及卡住检查的结果。
- 点"测试连接"时：一条固定的测试消息。

不会向 Chat2Know 项目或任何第三方发送数据。

## Permissions · 权限

| Permission | Why |
| --- | --- |
| `sidePanel` | Show the map and the stuck card in the browser's side panel. |
| `storage` | Keep your settings (including the API key) in the browser. |
| `activeTab`, `scripting` | Record the selection on the page you are on, only after you press Alt+S or use the right-click menu there; run the site script on the sites you ticked. Chat2Know never asks to read all sites. |
| `contextMenus` | The right-click entries *Add to Chat2Know map* and *Keep word for word*. |
| Optional host access to your model endpoint | Asked for when you save model settings, so the extension can call that one address. |
| Optional host access to the sites you tick | Asked for when you tick a site, so the site script can show the bar over a selection and the ＋ beside formulas there and, while question recording is on, notice the questions you send. A "REC" badge shows while questions are recorded. Password and other `input` fields are never read. |

`sidePanel` 用于在侧栏显示导图和引导卡；`storage` 保存设置；`activeTab` 和 `scripting` 只在你按了 Alt+S 或用了右键菜单的页面上记录选中内容，并在你勾选的网站上运行站点脚本，从不申请读取所有网站；`contextMenus` 提供右键"记到 Chat2Know 导图"和"保护原文记到 Chat2Know 导图"；模型接口的访问权限在保存模型设置时申请；勾选网站时申请该网站的权限，用来在选中文字时显示小浮层、在公式旁显示 ＋，提问记录开着时留意你发出的提问，记录时图标显示 REC，永不读取密码框等输入框。

## Your control · 你的控制权

- Undo any change to the map (Ctrl+Z); delete any item, topic or map; delete all data from the settings page.
- Turn question recording off at any time, on the first screen or in settings. Delete any recorded question on the Questions tab, or clear them all in settings (which also clears the stuck checks and reports made from them). *Not now* on a stuck card keeps that map quiet for the rest of the day.
- Export your maps as JSON, Markdown or OPML at any time. Exports contain your maps only: never the API key, and never your questions, checks or reports.
- Removing the extension deletes all of its data from the browser.

可以撤销导图的任何修改（Ctrl+Z）；删除任何条目、知识点或导图；在设置页清空所有数据。随时在首屏或设置里关闭提问记录；在"提问"页删除任意一条提问，或在设置里清空全部提问（同时清掉由它们得出的检查结果和报告）；在引导卡上点"不用"，这张导图当天不再提。随时导出 JSON、Markdown 或 OPML，导出只含导图，不含 API Key，也不含提问、检查结果和报告。卸载插件即删除全部数据。

## Contact · 联系

Questions about privacy: open an issue at <https://github.com/shaowenfu/Chat2Know/issues>.
