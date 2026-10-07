# Examples

## Classify after a squash-merged base

Stacked branch `feat/table-filters` was based on `feat/table-core`. `feat/table-core` was squash-merged to `master`. The human already ran `git pull origin master --no-rebase`. `MERGE_HEAD` is present.

Unmerged: `src/table.ts`, `src/table.test.ts`.

Do **not** use GitHub `compare/master...feat/table-filters`. After the squash that compare is a long commit dump and is a poor per-file aid.

Local evidence:

```bash
merge_base=$(git merge-base HEAD MERGE_HEAD)
git log $merge_base..HEAD -- src/table.ts
git log $merge_base..MERGE_HEAD -- src/table.ts
```

### Recommendation

**Safe to take yours**

| File | Why |
|---|---|
| `src/table.test.ts` | Incoming history on this file is only your squash of `feat/table-core` (`describe('core')`). HEAD already has that plus `describe('filters')`. Taking ours keeps the later tests. |

**Combine**

| File | Incoming added | Keep from ours |
|---|---|---|
| `src/table.ts` | Alice’s `TableView.split()` public API and its imports. Also your squash of `feat/table-core`. | Filter props and stacked-PR behavior that landed after the base. |

Stop here until the human names a file.

## Apply one file

Human: “apply `src/table.test.ts`.”

```bash
git checkout --ours -- src/table.test.ts
git add -- src/table.test.ts
```

Do not touch `src/table.ts`. Do not commit.

Human: “resolve `src/table.ts`.”

Edit conflict hunks so `split()` (incoming) and the filter feature (ours) both remain. `git add -- src/table.ts`. Still no commit.
