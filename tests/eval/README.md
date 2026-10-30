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
| `suggestionKindAccuracy` | `data/suggestion.json` | Recording suggestion classifies concept / instance / curiosity correctly |
| `preferenceRespected` | built in | After two deleted "who released it, when" suggestions, the model stops suggesting them |
| `placementTop3` | `data/placement.json` | The expected parent is among the top 3 placement suggestions |
| `masteryAgreement` | `data/mastery.json` | The mastery rule agrees with hand-labelled cases (no model involved) |
| `organize` | `tests/fixtures/pages/` | Cards per page and how many quotes are verbatim |
| `tagAccuracy` | `data/tags.json` | A tagged concept names the expected topic (any listed keyword); non-knowledge questions get no concepts. `tagSamples` shows the domains and names for a manual look |

Results go to `results/latest.json`. Commit it as the baseline when the owner runs the first real eval, and compare later runs against it before changing prompts, thresholds or rules.
