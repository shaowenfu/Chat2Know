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
| `tagAccuracy` | `data/tags.json` | A question is tagged with a topic of the seeded maps (`data/placement.json`) whose path names the expected keyword; non-knowledge questions get no topic. `tagSamples` shows the tags for a manual look |
| `placementTopicAccuracy` | `data/placement.json` | Each note goes into the map of its subject (as if the user opened it); the path names the expected topic (any listed keyword) |
| `unnamedMapNamed` | `data/placement.json` | A note whose subject has no map goes into a new unnamed map, which the model names after the expected subject |
| `statementMaxLength` | `data/placement.json` | The longest one-sentence statement placement made of a long selection (target: about 40 Chinese characters) |

`placementSamples` lists every case's path and statement for a manual look.

Results go to `results/latest.json`. Commit it as the baseline when the owner runs the first real eval, and compare later runs against it before changing prompts, thresholds or rules.
