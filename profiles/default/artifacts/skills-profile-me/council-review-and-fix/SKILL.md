---
name: council-review-and-fix
disable-model-invocation: true
description: Review local changes in rounds with a 3-model council, auto-fixing verified must-fix findings, small non-blocking 3-of-3 findings, and sub-target feedback until all delegates reach the target score (default 8) or max rounds (default 3). User-invoked only.
---

# Council review and fix

Iteratively review and fix local changes using the `council` skill and the `council-members` rule. Keep council scores in chat only and leave PR descriptions untouched unless the user explicitly asks to edit one. In the chat report, always display each delegate with its effort as `<Model> (<Effort>)` (for example, `Claude Opus 5.5 (High)`).

## Defaults

Override any of these when the user states a different value in the prompt:

- **Target score (`minScore`):** `8` (all 3 delegates must score `>= minScore`)
- **Max rounds (`maxRounds`):** `3`
- **Fix policy:**
  - Auto-fix every verified **must-fix** finding (any size) raised by **2 or 3 delegates** (for 2-of-3 findings, at least one flagging delegate marked it `Must-fix` and verification confirms it meets the must-fix rubric).
  - Auto-fix every verified **non-blocking** finding raised by **all 3 delegates** when the fix is small and low-risk (`XS`/`S`, directly scoped to the change). Defer larger (`M`/`L`), risky, or out-of-scope non-blocking 3-of-3 findings and report them for the user to decide.
  - Whenever any delegate scores below `minScore`, also fix verified in-scope feedback holding that delegate below `minScore` so every delegate can reach the target score.

## 1. Check scope and checkout

- Work only in a local git checkout. If the user gave a remote PR link that is not checked out locally, stop and ask where to work.
- Default review target is the combined diff from `<merge-base>` to the working tree (`git diff <merge-base>` plus untracked files from `git status --short`), covering committed, pushed, staged, and unstaged changes together. Use a narrower scope if the user states one.
- Before round 1, fix any known issues and run relevant checks so council reviews a clean starting state.

## 2. Run the review-and-fix loop

Repeat for `round = 1..maxRounds`:

1. **Dispatch a read-only round:** follow `council` and `council-members` to launch all 3 delegates in parallel. Leave files untouched while any delegate is still reviewing the checkout. Give every delegate the same brief:
   - Read-only review. Inspect surrounding code, callers, configs, and tests.
   - Give an overall score out of 10 (`X/10`).
   - Classify each finding using the shared rubric:
     - **Must-fix:** correctness bug, behavior regression, security or data leak, crash/OOM/performance cliff, broken contract, or broken wiring/DI.
     - **Non-blocking:** minor edge case, style or clarity nit, or optional test coverage.
   - Cite exact `file:line`, origin (`regression`, `new bug`, or `pre-existing`), concrete failure scenario, and rough fix size (`XS`, `S`, `M`, `L`) for every finding.
   - In round 2+, include the updated diff, a short list of what changed since the prior round, and an instruction to stay within the original change's scope.

2. **Verify and select findings:** check every candidate finding directly against the code and drop any that do not hold.
   - Select for auto-fix: every verified must-fix finding raised by 2 or 3 delegates (for 2-of-3 findings, at least one flagging delegate marked it `Must-fix` and verification confirms it meets the must-fix rubric), plus every verified small, low-risk in-scope non-blocking 3-of-3 finding (`XS`/`S`).
   - Defer for reporting: verified non-blocking 3-of-3 findings whose fix is larger (`M`/`L`), risky, or out of scope.
   - When any delegate scored `< minScore`, also select verified in-scope findings holding that delegate below `minScore` so all three delegates can reach `minScore`. Drop out-of-scope requests and scope creep.
   - When all three delegates scored `>= minScore`, ignore 1-of-3 findings and 2-of-3 non-blocking nits.

3. **Check stopping conditions:**
   - **Done:** all 3 delegates scored `>= minScore` and no auto-fixable findings remain. Exit the loop.
   - **`round == maxRounds` and not done** (either a delegate scored `< minScore` or auto-fixable findings remain): stop without editing further or starting another round. Report the round-by-round scores, list remaining and deferred findings in the format below, and give a clear recommendation on whether applying fixes and running another round is worthwhile or hitting diminishing returns so the user can decide.

4. **Apply fixes and verify:** fix the selected in-scope findings. Fight scope creep across rounds. Run relevant checks (tests, lint, typecheck) and confirm they pass before starting the next round.

## 3. Report in chat

1. Print the round-by-round score table using `<Model> (<Effort>)`. If stopped at `maxRounds` or if deferred findings remain, add a one-line `**Orchestrator call:**` summarizing whether continuing or fixing deferred items makes sense.
2. Concisely summarize what was fixed in each round and which checks ran.
3. For any **remaining unfixed or deferred findings**, list each using this layout (keep `Must-fix` / `Non-blocking` severity labels inside the per-model table only; leave them out of the overall summary, top metadata line, and recommendation reason):
   - Top metadata line (not bullets): `**Recommendation:** <Fix in this PR | Fix or follow-up | Skip / follow-up + brief reason> · **Found by:** <N> of 3 models · **Origin:** <origin> · **Fix size:** <size>`
   - Compact 3-row table listing all 3 delegates (`<Model> (<Effort>)`, using `—` when a delegate did not flag the issue):
     `| Model | Found | Severity | Origin | Fix size | Notes |`
   - Three bullets: `**Where:**`, `**Impact:**`, and `**Suggested fix:**`.
