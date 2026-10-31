# Privacy policy · 隐私说明

Chat2Know is a local-first browser extension. It has no account, no server of its own and no analytics. This page lists everything it stores and everything that leaves your browser.

Chat2Know 是一个本地优先的浏览器插件：没有账号，没有自己的服务器，不做任何统计。下面列出它存了什么、什么会离开你的浏览器。

Last updated · 最后更新：2026-10-31

## What is stored, and where · 存了什么，存在哪里

Everything is stored **in your browser only** (IndexedDB and `chrome.storage.local`):

- Cards you keep: their question titles, statements, the text you selected, and where it came from (page URL, page title, the quoted sentence).
- Questions you saved to ask later, and answers waiting in the temporary inbox (deleted automatically after 7 days unless you keep them).
- Your quiz and explanation results, used for spaced repetition and the weekly count.
- Your keep / drop decisions on suggestions, used as examples for later suggestions.
- Embedding vectors of your cards, if you set an embedding model.
- Model settings, **including your API key**. The key is read only by the extension's background script and is never written to logs or exports.
- If you turn on **Learning** for a site: the questions you send on that site, the concepts they were tagged with, the prerequisite graph built for them, and the resulting diagnoses and quizzes.

所有数据**只存在你的浏览器里**（IndexedDB 和 `chrome.storage.local`）：记下的卡片及其出处（网址、页面标题、引用的句子）、稍后问的问题和 7 天后自动删除的临时回答、考我与讲给我听的结果、你对建议的取舍、卡片的向量（配置了嵌入模型时）、模型设置（**包括 API Key**，只有插件后台读取，不写入日志和导出）；如果你为某个网站开启了"学习诊断"：你在该网站发出的提问、提问的概念标签、前置知识图谱、诊断和小测验。

## What leaves your browser · 什么会离开你的浏览器

Only requests to **the model provider you configure yourself** (any OpenAI-compatible endpoint), sent with your own key, and only for what you use:

| Feature | Sent to your model provider |
| --- | --- |
| Ask now / answer a queued question / follow-up | Your question and the sentence it is about |
| Keep an answer | The question, the sentence and the answer |
| Distill a saved selection (automatic after Save, when a model is set up) | The selected text |
| Organize page / pasted text | The page's text, or the text you pasted |
| Quiz me (AI check, use it) / Explain it to me / one-minute script | The card titles and statements involved, and your answer |
| Placement and linking (embedding model set) | Card titles and statements; concept names |
| Learning (only on sites you ticked) | Your recorded questions, in batches, for concept tagging and diagnosis |

Nothing is sent to the Chat2Know project or any third party. Saving an idea and "ask later" never contact a model.

只有发往**你自己配置的模型服务商**的请求（任意兼容 OpenAI 格式的接口，用你自己的 Key），而且只在你用到相应功能时发送：现在问 / 回答待问 / 追问发送问题和所在句子；记下回答发送问题、句子和回答；提炼（配置了模型时，保存知识后自动进行）发送你选中的文字；整页整理 / 粘贴整理发送页面或粘贴的文字；考我（AI 判定、用它解题）/ 讲给我听 / 一分钟讲清楚发送相关卡片和你的回答；挂载推荐与概念关联（配置了嵌入模型时）发送卡片标题、陈述和概念名称；学习诊断（只在你勾选的网站）分批发送你记下的提问用于打标签和诊断。不会向 Chat2Know 项目或任何第三方发送数据。存灵感和稍后问从不调用模型。

## Permissions · 权限

| Permission | Why |
| --- | --- |
| `sidePanel` | Show Chat2Know in the browser's side panel. |
| `storage` | Keep your settings (including the API key) in the browser. |
| `activeTab`, `scripting` | Show the selection toolbar on the page you are on, only after you click the Chat2Know icon, press a shortcut or use the right-click menu there. Chat2Know never asks to read all sites. |
| `contextMenus` | The right-click "Save to Chat2Know" and "Ask later" entries. |
| Optional host access to your model endpoint | Asked for when you save model settings, so the extension can call that one address. |
| Optional host access to sites you tick in Learning | Asked for when you tick a site, so the small recorder script can notice when you send a question there. Off by default; a "REC" badge shows while it records; pause or untick at any time. Password and other input fields are never read. |

`sidePanel` 用于显示侧栏；`storage` 保存设置；`activeTab` 和 `scripting` 只在你点了图标、按了快捷键或用了右键菜单的页面上显示划词工具条，从不申请读取所有网站；`contextMenus` 提供右键菜单；模型接口的访问权限在保存模型设置时申请；"学习诊断"勾选的网站权限在勾选时申请，默认关闭，记录时图标显示 REC，可随时暂停或取消，永不读取密码框等输入框。

## Your control · 你的控制权

- Delete any card, question or recorded question; clear all recorded questions; exclude a conversation from recording.
- Export everything as JSON at any time. Exports never include the API key; recorded questions are exported separately, only when you choose to.
- Removing the extension deletes all of its data from the browser.

可以删除任何卡片、问题或提问记录，清空提问记录，排除某段对话；随时导出 JSON（不含 API Key，提问记录需单独导出）；卸载插件即删除全部数据。

## Contact · 联系

Questions about privacy: open an issue at <https://github.com/shaowenfu/Chat2Know/issues>.
