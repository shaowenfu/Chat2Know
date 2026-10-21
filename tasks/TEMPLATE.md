---
id: T000
status: todo        # todo | doing | review | done
branch: task/T000-short-slug
---

# T000: <one-line goal>

## Goal
What to do, in one or two sentences.

## Scope
Files/directories you may change:
- `path/to/file`

## Acceptance criteria
Checks that can be verified automatically:
- [ ] `npm run check` passes
- [ ] <specific test> passes

## Do not
- Do not change public interfaces or add dependencies.
- Do not touch files outside the scope above.

## References
- Relevant code and docs.

## How to deliver
1. `git checkout -b <branch>` from latest `main`.
2. Do the work, run `npm run check`.
3. Set `status: review` in this file, commit, push, open a PR to `main`.
