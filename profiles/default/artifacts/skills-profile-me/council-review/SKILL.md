---
name: council-review
disable-model-invocation: true
description: Run a read-only 3-model council code review on a pull request or local changes, reporting 3/3 findings and 2/3 must-fix issues, with a GitHub comment draft when a PR link is given. User-invoked only.
---

# Council review

Run one read-only code review pass with three independent delegates using the `council` skill and the `council-members` rule. Keep council scores in chat only unless the user explicitly asks to edit a PR description.

## 1. Resolve the target

- **PR link or number** (this repo or another): inspect read-only with `gh pr view`, `gh pr diff`, and `gh api` at the PR's head commit. Remember that a PR link was provided.
- **Local changes** (default when no PR link is given): inspect the combined diff from `<merge-base>` to the working tree (`git diff <merge-base>` plus untracked files from `git status --short`), covering committed, pushed, staged, and unstaged changes together. Use a narrower scope if the user states one.

## 2. Run one read-only council round

Follow `council` and `council-members` to resolve the three delegates and their efforts, and launch all three in parallel. Give every delegate the same self-contained brief:

- **Read-only:** edit no files, run no git mutations, and post nothing to GitHub.
- **Inspect beyond the diff:** read surrounding code, callers, configs, and tests before making a claim.
- **Score:** give an overall score out of 10 (`X/10`).
- **Shared severity rubric:**
  - **Must-fix:** correctness bug, behavior regression, security or data leak, crash/OOM/performance cliff, broken contract, or broken wiring/DI.
  - **Non-blocking:** minor edge case, style or clarity nit, or optional test coverage.
- **Evidence:** cite exact `file:line` and a concrete failure scenario for every finding.

## 3. Verify and filter findings

Check every candidate finding directly against the code and drop any that do not hold. Keep:

- Every verified issue raised by **all 3 delegates (3/3)**, regardless of severity label.
- Every verified **must-fix** issue raised by **2 of 3 delegates (2/3 must-fix)**.

Drop 1/3 findings and 2/3 non-blocking nits. For each kept issue, determine:

- Consensus tag (`3/3` or `2/3 must-fix`)
- Origin (**regression**, **new bug**, or **pre-existing**)
- Concrete failure impact and rough fix size

The review is done when every kept finding has been verified against the code at exact line numbers.

## 4. Report in chat

1. Print the Round 1 score table using the delegate names from `council-members`.
2. List the kept issues with consensus tag, origin, exact `file:line`, concrete impact, and rough fix size. If nothing met the threshold, state `None`.
3. **GitHub comment draft:**
   - **PR link provided and at least one issue kept:** draft a ready-to-paste GitHub comment naming the 3 models that ran and listing the flagged issues with exact locations, impact, and suggested fixes. Write in constructive teammate prose (full sentences, no semicolons). Never post the comment automatically.
   - **PR link provided and no issues kept:** state that nothing met the threshold and skip the draft.
   - **No PR link provided (local review):** skip the comment draft.
