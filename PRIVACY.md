# Privacy policy · 隐私说明

Chat2Know is a local-first browser extension. It has no account, no server of its own and no analytics. This page lists everything it stores and everything that leaves your browser.

Chat2Know 是一个本地优先的浏览器插件：没有账号，没有自己的服务器，不做任何统计。下面列出它存了什么、什么会离开你的浏览器。

This describes version 0.2. · 本文对应 0.2 版。

## What is stored, and where · 存了什么，存在哪里

Everything is stored **in your browser only** (IndexedDB and `chrome.storage.local`):

- Your maps: subjects, chapters and topics, and the items you record (a formula's LaTeX or a one-sentence statement) with where each came from (page URL, page title, the quoted text around it).
- The history of your changes to the maps, so they can be undone, and where Chat2Know placed items and where you moved them (used as examples for later placements).
- Embedding vectors of your topics and items, if you set an embedding model.
- Model settings, **including your API key**. The key is read only by the extension's background script and is never written to logs or exports.
- The sites you ticked, and outlines Chat2Know proposed for your subjects.
- Only if you turn on **Also record the questions I send on these sites**: the questions you send on the ticked sites, which topics they were matched to, prerequisite links between your topics, and possible gaps with what was drafted for them.

所有数据**只存在你的浏览器里**（IndexedDB 和 `chrome.storage.local`）：你的导图（学科、章、知识点，以及你记下的公式 LaTeX 或一句话结论和它们的出处：网址、页面标题、前后引用的文字）；导图的修改历史（用于撤销）和归位记录（插件放在哪里、你改到哪里，用作以后归位的示例）；配置了嵌入模型时，知识点和条目的向量；模型设置（**包括 API Key**，只有插件后台读取，不写入日志和导出）；勾选的网站和插件为学科提出的大纲；只有在你打开"也记录我在这些网站上发出的提问"时：你在勾选网站上发出的提问、它们对应的知识点、知识点之间的前置关系，以及可能的短板和为它准备的内容。

## What leaves your browser · 什么会离开你的浏览器

Only requests to **the model provider you configure yourself** (any OpenAI-compatible endpoint), sent with your own key. Without a model set up, nothing leaves your browser. With one:

| When | Sent to your model provider |
| --- | --- |
| You record an item (automatic placement) | The item, a few words of the conversation around it, the titles of your subjects' chapters and topics, and the last placements you corrected |
| Embedding model set | The item's text, your topics' titles with a few of their items |
| You open the side panel on a new subject's first note (outline offer) | The subject's name, its existing topic titles, and a table of contents if you paste one |
| You open "Move" on a recorded item, with an embedding model | The item's text |
| Question recording is on | Your recorded questions, in batches, with your topic titles (to match them); your topic titles per subject (prerequisites); for a gap card: the topic, its items and the questions behind it; your answer if you try a question |
| You click "Test connection" | A fixed test message |

Nothing is sent to the Chat2Know project or any third party.

只有发往**你自己配置的模型服务商**的请求（任意兼容 OpenAI 格式的接口，用你自己的 Key）。没有配置模型时，什么都不会离开浏览器。配置之后：记下条目时（自动归位）发送该条目、它前后的几个字、各学科的章和知识点标题、你最近改过的归位；配置了嵌入模型时发送条目文字、知识点标题及其下几条条目；新学科第一条之后提议大纲时发送学科名、已有知识点标题和你粘贴的目录；打开"改位置"且配置了嵌入模型时发送条目文字；打开提问记录后，分批发送你的提问和知识点标题（用于对应），按学科发送知识点标题（前置关系），短板卡片发送该知识点、其下条目和相关提问，出题试试时发送你的回答；"测试连接"发送一条固定的测试消息。不会向 Chat2Know 项目或任何第三方发送数据。

## Permissions · 权限

| Permission | Why |
| --- | --- |
| `sidePanel` | Show the map in the browser's side panel. |
| `storage` | Keep your settings (including the API key) in the browser. |
| `activeTab`, `scripting` | Record the selection on the page you are on, only after you press Alt+S or use the right-click menu there; run the small site script on the sites you ticked. Chat2Know never asks to read all sites. |
| `contextMenus` | The right-click "Add to Chat2Know map" entry. |
| `alarms` | Look at recorded questions ten minutes after a conversation goes quiet (only when question recording is on). |
| Optional host access to your model endpoint | Asked for when you save model settings, so the extension can call that one address. |
| Optional host access to the sites you tick | Asked for when you tick a site, so the site script can show ＋ beside formulas there and, only if you turn it on, notice the questions you send. A "REC" badge shows while questions are recorded. Password and other `input` fields are never read. |

`sidePanel` 用于在侧栏显示导图；`storage` 保存设置；`activeTab` 和 `scripting` 只在你按了 Alt+S 或用了右键菜单的页面上记录选中内容，并在你勾选的网站上运行站点脚本，从不申请读取所有网站；`contextMenus` 提供右键"记到 Chat2Know 导图"；`alarms` 用于一段对话安静十分钟后查看提问记录（只在打开提问记录时）；模型接口的访问权限在保存模型设置时申请；勾选网站时申请该网站的权限，用来在公式旁显示 ＋，只有你打开提问记录时才留意你发出的提问，记录时图标显示 REC，永不读取密码框等输入框。

## Your control · 你的控制权

- Undo any change to the map (Ctrl+Z); delete any item, topic or subject; delete all data from the settings page.
- Turn question recording off at any time; a topic you say "No thanks" to is not asked about for 30 days.
- Export your maps as JSON, Markdown or OPML at any time. Exports contain your maps only: never the API key, and never recorded questions.
- Removing the extension deletes all of its data from the browser.

可以撤销导图的任何修改（Ctrl+Z）；删除任何条目、知识点或学科；在设置页清空所有数据。随时关闭提问记录；对某一块点了"不用"，30 天内不再问。随时导出 JSON、Markdown 或 OPML，导出只含导图，不含 API Key，也不含提问记录。卸载插件即删除全部数据。

## Contact · 联系

Questions about privacy: open an issue at <https://github.com/shaowenfu/Chat2Know/issues>.
