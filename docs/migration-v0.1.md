# 从 0.1 升级 · Moving from 0.1

0.2 是重写的版本：0.1 的卡片、问句标题、稍后问、考我和复习都不再有；取而代之的是按学科组织的知识导图。0.2 用一个新的数据库，不会改动 0.1 的数据。
0.2 is a rebuild: 0.1's cards, question titles, ask-later, quizzes and reviews are gone; a knowledge map per subject takes their place. 0.2 uses a new database and never changes 0.1's data.

## 带过来什么 · What comes over

- 0.1 的**知识卡片**：正文里有独立成行的公式的，每个公式变成一个公式条目；其他卡片变成一句话的结论（用卡片的陈述，没有就用正文第一行）。出处（网址和引用）保留。
  0.1's **knowledge cards**: each display formula in a card's body becomes a formula item; any other card becomes a one-sentence statement (its statement, else the body's first line). Sources (URL and quote) are kept.
- 不带过来：问句标题、灵感、稍后问和回答、掌握要求、考我和复习记录、学习诊断的提问记录。
  Not brought over: question titles, ideas, ask-later questions and answers, mastery marks, quiz and review history, recorded questions.

## 怎么做 · How

1. 像平常一样更新插件（见 [安装说明](install.md#更新--updating)）。0.1 的数据还留在浏览器里。
   Update the extension as usual (see [Updating](install.md#更新--updating)). 0.1's data stays in the browser.
2. 打开侧栏，点底部的 **导入旧版数据**。插件直接读取这个浏览器里 0.1 的数据；在别的浏览器里，就选择 0.1 导出的 JSON 文件（0.1 里"导出 ▾ → JSON"）。
   Open the side panel and click **Import v0.1 data** at the bottom. It reads 0.1's data in this browser directly; in another browser, pick a JSON file exported from 0.1 (0.1: *Export ▾ → JSON*). Settings › **Import** takes that file too.
3. 导入的条目先放在"导入的笔记 › 待归位"里。配置了模型就会自动归位到各自的学科和知识点；没配置时可以拖动到合适的位置。重复导入不会产生重复条目。
   Imported items wait in *Imported notes › Unplaced*. With a model set up they move to their subjects and topics on their own; without one, drag them where they belong. Importing again adds no duplicates.

模型设置会保留。0.1 里勾选过"学习诊断"的网站会变成显示 ＋ 的网站；如果当时没有暂停，提问记录保持开启（设置页可以关掉）。
Model settings carry over. The sites you ticked for 0.1's Learning become the sites that show ＋; question recording stays on unless it was paused (turn it off in settings).
