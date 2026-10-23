---
description: Implement a Core change spec or ticket of the ~/.agents store in a Core change worktree, or continue its PR. Use with an issue or PR number or URL.
argument-hint: <issue or PR number or URL>
---

# Implement a Core change

This is the Implementation step of the Core change workflow: Grilling → Spec → Implementation → Merge. The argument the user gave with the command is an issue or a PR, as a number or a URL.

When a skill a step needs is missing, name it and stop. The skills come from the Core owner's Lineage, not from Core.

## 1. Check the checkout

Stop unless the current checkout is a Core change worktree, as `core-change-worktree.mdc` defines it. Tell the user to start a new session in a new worktree from `main`. From here on, follow that rule. Keep the branch name as it is, because the tool that made the worktree, such as T3 Code, may track it by its branch.

## 2. Tell an issue from a PR

Try the argument as a PR first, and fall back to an issue, as `docs/agents/issue-tracker.md` describes. A PR is a follow-up. An issue is new work.

## New work

1. Run `git fetch origin`, then merge `origin/main`.
2. Read the issue with its comments. It is a spec, or a ticket of one.
3. Build the change, with the steps the table below requires:
   - Make every item in the issue's Implementation Decisions and Planned doc changes sections.
   - Run `/tdd` with the seams from the issue's Testing Decisions. They are agreed, so `/tdd` does not ask about them again.
   - When `ag` needs a new Core file, add it to `CORE_FILES` in `sync/test/world.mjs`, so the tests copy it.
   - When the issue's Profile impact names a Profile migration, add it to `sync/migrations/` with the next free number, and test it on a profile fixture under `sync/test/fixtures/`. Never edit a real profile.
4. Run `/code-review origin/main`. Apply every finding you can confirm in the code. Keep each finding you reject, with its reason, for the PR description. Mark a rejected finding **decision needed** when neither the spec nor the code settles it, so only the user can choose. Do one round, then rerun the tests the table requires.
5. Run `git fetch origin` and merge `origin/main` again. When an ADR or a Profile migration this branch adds now shares its number with another one in its folder, stop and tell the user. The user renumbers by hand. Otherwise run `npm test` in `sync/` when the table requires it.
6. Push the branch: `git push -u origin HEAD` the first time, `git push` after that.
7. Open one PR into `main`. Write its description with `/gen-pr-desc`, add a section with the review findings you rejected and why, and end it with `Closes #<issue>`. Number the rejected findings. Write each one as `**Reviewer:** <what the reviewer says is wrong>. **Not applied because:** <your reason>.`, and start each one marked in step 4 with `(decision needed)`. Then stop. Your final message lists the `(decision needed)` findings by number, each with its options and your recommendation, and asks the user to choose. The user reviews and merges the PR.

After `/to-tickets`, each ticket gets its own worktree and its own PR, which closes that ticket. The spec issue stays open until the user closes it after the last ticket.

## Follow-up

1. Stop when the PR is merged or closed, or when this worktree has uncommitted changes. When the worktree is not on the PR's branch, run `git fetch origin` and `git switch <branch>`. When that branch is checked out in another worktree, stop and name that worktree.
2. Wait for the user's first message, which describes the change. Write no summary before it.
3. Implement only when the user asks for it. Otherwise ask a follow-up question.
4. To clarify the change, use `/grill-with-docs` directly. `/core-grill` runs `ag update`, which this worktree does not allow. The grilling is read-only, and keeps a list of planned doc changes instead of writing docs, as in `/core-grill`.
5. Run step 1 of New work. Build what the user asked for as step 3 builds a spec, then run steps 4 to 6, which push to the PR's branch. Then update the PR description with `/gen-pr-desc`. Take `(decision needed)` off each finding the user has decided, and move a finding you then applied out of the rejected list. When the follow-up changes a decision in the spec, update the spec issue body too.

## Which steps a change needs

Look up the files in `git diff --name-only origin/main...HEAD`. The highest matching row wins. Plan with the files the change will touch, and check the real diff again before the PR.

| Changed | `/tdd` | `npm test` | `/code-review origin/main` |
|---|---|---|---|
| `sync/` (except `sync/CONTEXT.md`), `.githooks/`, `.gitattributes`, `.gitignore`, `.github/`, and any path not in the other rows | yes | yes | yes |
| `artifacts/`: any change, including new, renamed, or removed entries | only when the layout test needs a new case | yes | yes |
| Docs only: `README.md`, `docs/` (ADRs included), `CONTEXT.md`, `CONTEXT-MAP.md`, `sync/CONTEXT.md`, `next.md`, `LICENSE` | no | no | no |
