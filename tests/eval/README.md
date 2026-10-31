# Evals

Quality checks against a real model. Not part of `npm run check`.

```bash
# .env.local (gitignored)
CHAT2KNOW_BASE_URL=https://api.openai.com/v1
CHAT2KNOW_MODEL=gpt-4o-mini
CHAT2KNOW_API_KEY=sk-...
CHAT2KNOW_EMBEDDING_MODEL=text-embedding-3-small

npm run eval
```

`CHAT2KNOW_BASE_URL=mock npm run eval` dry-runs the harness against the test server (scores are meaningless).

| Metric | Data | What it measures |
| --- | --- | --- |
| `tagAccuracy` | `data/tags.json` | A tagged concept names the expected topic (any listed keyword); non-knowledge questions get no concepts. `tagSamples` shows the domains and names for a manual look |
| `placementSubjectAccuracy` | `data/placement.json` | Automatic placement picks the expected subject on a seeded map (a note of a subject not on the map should get a new one) |
| `placementTopicAccuracy` | `data/placement.json` | The subject is right and the path names the expected topic (any listed keyword) |
| `statementMaxLength` | `data/placement.json` | The longest one-sentence statement placement made of a long selection (target: about 40 Chinese characters) |

`placementSamples` lists every case's path and statement for a manual look.

Results go to `results/latest.json`. Commit it as the baseline when the owner runs the first real eval, and compare later runs against it before changing prompts, thresholds or rules.
