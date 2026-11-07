# Evals

Quality checks against a real model. Not part of `npm run check`.

```bash
# .env.local (gitignored)
CHAT2KNOW_BASE_URL=https://api.openai.com/v1
CHAT2KNOW_MODEL=gpt-4o-mini
CHAT2KNOW_API_KEY=sk-...
CHAT2KNOW_EMBEDDING_MODEL=text-embedding-3-small

npm run eval                      # prompts in Chinese; CHAT2KNOW_LANG=en for English
```

`CHAT2KNOW_BASE_URL=mock npm run eval` dry-runs the harness against the test server (scores are meaningless).

| Metric | Data | What it measures |
| --- | --- | --- |
| `stuckAccuracy`, `stuckKindAccuracy`, `stuckTopicAccuracy` | `data/stuck.json` | 10 hand-labelled question sequences (5 stuck, 5 not): whether the stuck check gets stuck / not stuck right, and for the stuck ones the kind (circling, stuck, offTarget, phrasing) and a topic containing the expected word (none for `phrasing` with no topic). `stuckSamples` shows each reply for a manual look |
| `stuckExplanationMaxSize` | `data/stuck.json` | The longest card explanation, in characters (Chinese) or words (English); the prompt asks for about 80 / 50 |
| `askLanguageRight`, `askNoHeadings`, `askMentions`, `askMaxSentences`, `askFollowUpBuilds` | `data/ask.json` | Floating-window answers (streamed): in the prompt's language, no headings, containing the words a right answer needs, how many sentences the longest has, and whether a follow-up builds on the earlier answer. `askSamples` holds the texts |
| `reportLanguageRight`, `reportNoScores`, `reportNoJudging`, `reportQuotesQuestions`, `reportStartsWithHeading`, `reportSizes` | `data/stuck.json` (its questions, per map) | Reports on a Chinese and an English map: right language, no scores / percentages / mastery levels, no judging of the person, quoting the learner's own questions, how many start with a heading (the page has its own title), and their size in characters / words. `reportSamples` holds the texts |
| `requestsHonoured` | `data/requests.json` | Notes recorded with a request typed after 记下 (keep a table with its formulas, only the table, three bullet points) come back as asked, and one without a request is still a single sentence of at most 60 characters. `requestSamples` holds the notes |
| `placementTopicAccuracy` | `data/placement.json` | Each note goes into the map of its subject (as if the user opened it); the path names the expected topic (any listed keyword) |
| `unnamedMapNamed` | `data/placement.json` | A note whose subject has no map goes into a new unnamed map, which the model names after the expected subject |
| `termsExplained` | `data/placement.json` | A bare term ("幂指函数") is recorded as "term: one-sentence explanation" |
| `outlineValid` | `data/outlines.json` | The proposed outline passes validation: real titles, not a generic template, in the language of the map's name |
| `outlineCoverage` | `data/outlines.json` | Share of each subject's expected chapters (keywords) the outline contains |
| `statementMaxLength` | `data/placement.json` | The longest one-sentence statement placement made of a long selection (target: about 40 Chinese characters) |

`placementSamples` lists every case's path and statement for a manual look.

Results go to `results/latest.json`. Commit it as the baseline when the owner runs the first real eval, and compare later runs against it before changing prompts, thresholds or rules.
