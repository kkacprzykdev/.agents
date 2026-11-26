---
name: council-review
disable-model-invocation: true
description: Run a read-only 3-model council code review on a pull request or local changes, reporting verified findings with per-model breakdowns and fix recommendations, plus a GitHub comment draft when a PR link or number is given. User-invoked only.
---

# Council review

Run one read-only code review pass with three independent delegates using the `council` skill and the `council-members` rule. Keep council scores in chat only unless the user explicitly asks to edit a PR description. Always display each delegate with its effort as `<Model> (<Effort>)` (for example, `Claude Opus 5.5 (High)`).

## 1. Resolve the target

- **PR link or number** (this repo or another): inspect read-only with `gh pr view`, `gh pr diff`, and `gh api` at the PR's head commit. Note that a PR reference was provided.
- **Local changes** (default when no PR link or number is given): inspect the combined diff from `<merge-base>` to the working tree (`git diff <merge-base>` plus untracked files from `git status --short`), covering committed, pushed, staged, and unstaged changes together. Use a narrower scope if the user states one.

## 2. Run one read-only council round

Follow `council` and `council-members` to resolve the three delegates and their efforts, and launch all three in parallel. Give every delegate the same self-contained brief:

- **Read-only:** edit no files, run no git mutations, and post nothing to GitHub.
- **Inspect beyond the diff:** read surrounding code, callers, configs, and tests before making a claim.
- **Score:** give an overall score out of 10 (`X/10`).
- **Shared severity rubric:**
  - **Must-fix:** correctness bug, behavior regression, security or data leak, crash/OOM/performance cliff, broken contract, or broken wiring/DI.
  - **Non-blocking:** minor edge case, style or clarity nit, or optional test coverage.
- **Evidence:** cite exact `file:line`, origin (`regression`, `new bug`, or `pre-existing`), concrete failure scenario, and rough fix size for every finding.

## 3. Verify and filter findings

Check every candidate finding directly against the code and drop any that do not hold. Keep:

- Every verified issue raised by **all 3 delegates**, regardless of severity label.
- Every verified **must-fix** issue raised by **2 of 3 delegates** (at least one flagging delegate marked it must-fix and verification confirms it meets the must-fix rubric).

Drop 1-of-3 findings and 2-of-3 non-blocking nits. For each kept issue, determine:

- **Recommendation** (orchestrator call; prefer fixing small, low-risk issues in the PR right away, even when non-blocking):
  - `Fix in this PR` — verified must-fix issue of any size, or non-blocking issue with a small, low-risk fix (`XS`/`S`, directly scoped to the PR).
  - `Fix or follow-up` — non-blocking issue with a medium fix (`M`) or a judgment call / product trade-off.
  - `Skip / follow-up` — non-blocking issue with a large (`L`), risky, or out-of-scope fix.
- **Found by:** `3 of 3 models` or `2 of 3 models`.
- **Origin:** `regression`, `new bug`, or `pre-existing`.
- **Fix size:** `XS`, `S`, `M`, or `L` with a rough line estimate.
- **Where** (exact `file:line`), **Impact** (concrete failure scenario), **Suggested fix**, and the **per-model breakdown** for all 3 delegates.

Keep `Must-fix` / `Non-blocking` severity labels inside the per-model breakdown table only; leave them out of the top metadata line and recommendation label so one delegate's severity label is not overstated as consensus.

The review is done when every kept finding has been verified against the code at exact line numbers.

## 4. Report in chat

1. Print the Round 1 score table using `<Model> (<Effort>)`, followed by a one-line `**Orchestrator call:**` summarizing the overall recommendation across the kept issues.
2. List the kept issues (or `None` if nothing met the threshold). For each issue, use this layout:
   - Top metadata line (not bullets): `**Recommendation:** <call + brief reason> · **Found by:** <N> of 3 models · **Origin:** <origin> · **Fix size:** <size>`
   - Compact 3-row table listing all 3 delegates (use `—` when a delegate did not flag the issue):
     `| Model | Found | Severity | Origin | Fix size | Notes |`
   - Three bullets: `**Where:**`, `**Impact:**`, and `**Suggested fix:**`.
3. **GitHub comment draft:**
   - **PR link or number provided and at least one issue kept:** draft a ready-to-paste GitHub comment in constructive teammate prose (full sentences, no semicolons):
     - Clear intro naming all 3 models with effort (for example, `"I used the council skill to review this PR with 3 independent AI models: <Model A> (<Effort>), <Model B> (<Effort>), and <Model C> (<Effort>). Each finding below shows how many models independently flagged it and includes a per-model breakdown."`). Keep the intro simple instead of listing issue numbers per model count.
     - One-line `**Overall recommendation:**` summarizing what to fix in the PR.
     - For each issue: the top metadata line (`**Recommendation:** <call> · **Found by:** <N> of 3 models · **Origin:** <origin> · **Fix size:** <size>`), the three bullets (`**Where:**`, `**Impact:**`, `**Suggested fix:**`), and the visible (non-accordion) 3-row per-model breakdown table (`| Model | Found | Severity | Origin | Fix size | Notes |`) below the bullets.
     - Never post the comment automatically.
   - **PR link or number provided and no issues kept:** state that nothing met the threshold and skip the draft.
   - **No PR link or number provided (local review):** skip the comment draft.
