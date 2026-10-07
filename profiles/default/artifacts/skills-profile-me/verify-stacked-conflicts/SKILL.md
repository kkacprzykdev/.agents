---
name: verify-stacked-conflicts
disable-model-invocation: true
description: Classifies unmerged files in an in-progress merge of the default branch into a PR branch. Built for a stacked PR whose squash-merged base is now on the default branch, and also works for ordinary PR catch-up merges. Use when there are merge conflicts after `git pull` of the default branch, when asked to classify take-ours vs combine, or when invoked as `/verify-stacked-conflicts`. User-invoked only. Does not pull, fetch, rebase, or commit.
---

# Verify stacked conflicts

Classify **already conflicted** files after a stacked-PR catch-up merge. The human already ran something like `git pull origin <default> --no-rebase`. Original base SHAs may still sit on the stacked branch even though a squash of that base is on the default branch. Incoming “theirs” may mix the author’s own squash with other people’s work.

This skill starts **after** the pull. It does **not** pull, fetch, rebase, merge, or commit.

**Ordinary PRs.** The same steps work when the branch is not stacked. There is usually no landed base to recognize, so expect nearly every file in **Combine**. That is the correct result. Conflicts from a rebase are out of scope (see step 2).

User-invoked only (`/verify-stacked-conflicts` or this skill attached). Never auto-trigger from ambient chat.

## Never

- `git pull`, fetch, rebase, merge, or `--abort`
- `git checkout --ours` / `--theirs` on the whole tree
- Force-push, skip hooks, or commit
- GitHub `compare/<default>...<branch>` or `<branch>...<default>` as the per-file aid (after a squash those dumps are huge and do not show what **this file** gained)
- Dump full file contents into chat
- Invent another worktree or clone; work only in the checkout the human named, or cwd if they are already there
- Auto-apply `--ours` unless the human names a classified file to apply

If there is no merge in progress, say so and **stop**.

## 1. Checkout

Use the path the human named. If they did not name one, use the current working directory. Confirm it is a git checkout. Do not switch trees.

## 2. Gate: merge in progress

```bash
git rev-parse -q --verify MERGE_HEAD
```

| Result | Action |
|---|---|
| `MERGE_HEAD` exists | Continue |
| Missing (rebase, cherry-pick, clean tree, or conflicts already cleared) | Tell the human this is not a conflicted **merge**. Stop. Do not start a merge. |

Also useful:

```bash
git diff --name-only --diff-filter=U
git ls-files -u
```

If the unmerged list is empty, say the merge has no remaining conflicts and **stop**. Do not `git commit`.

## 3. Identity during the merge

| Side | Ref | Meaning |
|---|---|---|
| ours / `:2:` | `HEAD` | PR branch (stacked or not) |
| theirs / `:3:` | `MERGE_HEAD` | incoming default branch (e.g. `origin/master`) |

```bash
merge_base=$(git merge-base HEAD MERGE_HEAD)
```

## 4. Per-file evidence (local only)

For each unmerged path, collect **in this order**. Do not open GitHub compare.

1. Working-tree conflict hunks (`<<<<<<<` / `=======` / `>>>>>>>`).
2. Ours history: `git log --format='%h %an <%ae> %s' $merge_base..HEAD -- <path>`
3. Incoming history: `git log --format='%h %an <%ae> %s' $merge_base..MERGE_HEAD -- <path>`
4. Optionally, while stages still exist: `git show :2:<path>` vs `git show :3:<path>` — skim, do not paste wholesale.

Delete / add / rename unmerged entries (see `git ls-files -u` / `git status`) are **not** take-ours. Put them in **Combine** with a one-line why.

## 5. Classify

Two buckets only.

### Safe to take yours

Every incoming change **on that file** is already present in `HEAD`. The typical case is the author’s own squash (or equivalent) of the already-landed base, with the stacked branch holding that work plus later feature commits.

Verify containment against the hunks. The author name alone does not qualify a file. An incoming commit by the same author from a separate, already-merged PR is **not** in `HEAD`, and taking ours would drop it. Classify that file as **Combine**.

Taking ours avoids regressing the branch’s later work.

When the human later asks to apply that file:

```bash
git checkout --ours -- <file>
git add -- <file>
```

Do not run this during the classify pass.

### Combine

Incoming has other authors and/or new APIs, imports, tests, or splits. Keep both independent product changes:

| Keep from incoming (theirs) | Keep from ours (HEAD) |
|---|---|
| New public API / signatures | Stacked-PR feature hunks (props, UI chrome, behavior) |
| New imports required by that API | Feature tests that exist only on the stacked branch |
| Other people’s `describe` blocks | Later commits that already include the landed base |
| New component / file splits they landed | |

Do not take-ours-only on these files. Do not drop incoming API to “make the feature compile on the old surface.”

## 6. Output, then stop

Print **two tables**. No other dump. Then stop unless the human names a file to resolve.

### Safe to take yours

| File | Why |
|---|---|
| `<path>` | Incoming is only your landed-base squash; stacked branch already has later work |

### Combine

| File | Incoming added | Keep from ours |
|---|---|---|
| `<path>` | e.g. new `split()` API, Alice’s imports | e.g. filter props + filter tests |

If a bucket is empty, still show the heading and write `None`.

Do not `git add` on this pass. Do not commit.

## 7. Apply one named file (only if asked)

Resolve **that path only**. Re-read hunks + the two `git log` ranges if needed.

| Classification | Action |
|---|---|
| Safe to take yours | `git checkout --ours -- <file>` then `git add -- <file>` |
| Combine | Edit the working tree so both intents remain. Then `git add -- <file>`. |

Afterward: remaining `git diff --name-only --diff-filter=U`. Still no commit, no push, no resolving siblings “while you’re in there.”

Worked classify examples: [examples.md](examples.md).
