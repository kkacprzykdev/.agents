---
name: council-review
disable-model-invocation: true
description: Run a read-only 3-model council code review on a pull request or local changes, reporting verified findings with per-model breakdowns and fix recommendations, plus a GitHub comment draft when a PR link or number is given. User-invoked only.
---

# Council review

Run one read-only code review pass with three independent delegates using the `council` skill and the `council-members` rule. Leave PR descriptions untouched unless the user explicitly asks to edit one. In the chat report and GitHub comment draft, always display each delegate with its effort as `<Model> (<Effort>)` (for example, `Claude Opus 5.5 (High)`).

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
- **Evidence:** cite exact `file:line`, origin (`regression`, `new bug`, or `pre-existing`), whether it is in scope of the change's stated goal (`Yes`, `No`, or `—` when unclear or not applicable), concrete failure scenario, and rough fix size for every finding.

## 3. Verify and filter findings

Check every candidate finding directly against the code and drop any that do not hold. Keep:

- Every verified issue raised by **all 3 delegates**, regardless of severity label.
- Every verified **must-fix** issue raised by **2 of 3 delegates** (at least one flagging delegate marked it must-fix and verification confirms it meets the must-fix rubric).

Drop 1-of-3 findings and 2-of-3 non-blocking nits. For each kept issue, determine:

- **Recommendation** (orchestrator call; leave scope calls on pre-existing issues to the author):
  - `Fix in this PR` — verified must-fix issue introduced by the change (or blocking CI/merge) of any size, or an in-scope non-blocking issue with a small, low-risk fix (`XS`/`S`).
  - `Fix or follow-up` — pre-existing issue (even when small, so the author decides whether to fold it in or defer it), non-blocking issue with a medium fix (`M`), or a judgment call / product trade-off.
  - `Skip / follow-up` — non-blocking issue with a large (`L`), risky, or out-of-scope fix.
- **Found by:** `3 of 3 models` or `2 of 3 models`.
- **Origin:** `regression`, `new bug`, or `pre-existing`.
- **Fix size:** `XS`, `S`, `M`, or `L` with a rough line estimate.
- **Where** (exact `file:line`), **Impact** (concrete failure scenario), **Suggested fix**, and the **per-model breakdown** for all 3 delegates (including `In scope`: `Yes`, `No`, or `—`).

Keep `Must-fix` / `Non-blocking` severity labels inside the per-model breakdown table only; leave them out of the overall summary, top metadata line, and recommendation reason so one delegate's severity label is not overstated as consensus.

The review is done when every kept finding has been verified against the code at exact line numbers.

## 4. Report in chat

1. Print the score table using `<Model> (<Effort>)` (include prior round columns when reviewing a follow-up round), followed by `**Orchestrator call:**` summarizing the overall recommendation across the kept issues. When kept findings include pre-existing or optional items that do not all need to land in the same PR, leave the scope call to the author and offer 2–3 concrete options naming the findings by number (for example, `finding 1`, `findings 2–5`).
2. List the kept issues (or `None` if nothing met the threshold). For each issue, use this layout:
   - Top metadata line (not bullets): `**Recommendation:** <call + brief reason> · **Found by:** <N> of 3 models · **Origin:** <origin> · **Fix size:** <size>`
   - Compact 3-row table listing all 3 delegates (use `—` when a delegate did not flag the issue, or when `In scope` is unclear or not applicable):
     `| Model | Found | Severity | Origin | In scope | Fix size | Notes |`
   - Three bullets: `**Where:**`, `**Impact:**`, and `**Suggested fix:**`.
3. **GitHub comment draft:**
   - **PR link or number provided:** draft a ready-to-paste GitHub comment in constructive teammate prose (full sentences, no semicolons). Always refer to findings as `finding 1` / `findings 2–5` (never `#1` / `#2`, which GitHub autolinks to repository issues and PRs). Never post the comment automatically.
     - **At least one issue kept:**
       - Two-sentence intro naming all 3 models with effort and pointing to the per-issue counts below (for example, `"I used the council skill to review this PR with 3 independent AI models: <Model A> (<Effort>), <Model B> (<Effort>), and <Model C> (<Effort>). Each finding below shows how many models independently flagged it and includes a per-model breakdown."`).
       - `**Overall recommendation:**` summarizing what to fix in the PR. When kept findings include pre-existing or optional items, note that not everything has to land in this PR and list 2–3 concrete scoping options naming the findings (for example, `"Fix only finding 1 if you want..."`, `"Fix findings 1 and 3–5 if you want..."`, `"Fix all findings (1–6) if you want..."`) so the author can decide scope.
       - Score table directly before issue 1 (`| Model | Round 1 |`, adding prior round columns such as `| Model | Round 1 | Round 2 |` on follow-up rounds).
       - For each issue: the top metadata line (`**Recommendation:** <call> · **Found by:** <N> of 3 models · **Origin:** <origin> · **Fix size:** <size>`), the three bullets (`**Where:**`, `**Impact:**`, `**Suggested fix:**`), and the 3-row per-model breakdown table (`| Model | Found | Severity | Origin | In scope | Fix size | Notes |`) directly below the bullets.
     - **No issues kept (clean pass):**
       - One-sentence intro naming the review round (if follow-up), reviewed commit, and all 3 models with effort.
       - Score table (`| Model | Round 1 |`, or `| Model | Round 1 | Round 2 |` on follow-up rounds).
       - One-line `**Overall recommendation:**` stating the PR is ready to approve as reviewed, noting that prior round findings are verified fixed (on follow-up rounds) and no remaining issues met the threshold.
   - **No PR link or number provided (local review):** skip the comment draft.
