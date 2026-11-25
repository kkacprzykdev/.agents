---
name: council-review-and-fix
disable-model-invocation: true
description: Review local changes in rounds with a 3-model council, fixing verified 3/3 findings and 2/3 must-fix issues until all delegates reach the target score (default 8) or max rounds (default 3). User-invoked only.
---

# Council review and fix

Iteratively review and fix local changes using the `council` skill and the `council-members` rule. Keep council scores in chat only and leave PR descriptions untouched unless the user explicitly asks to edit one.

## Defaults

Override any of these when the user states a different value in the prompt:

- **Target score (`minScore`):** `8` (all 3 delegates must score `>= minScore`)
- **Max rounds (`maxRounds`):** `3`
- **Fix threshold:** all verified **3/3** findings (regardless of severity label) plus all verified **2/3 must-fix** findings

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
   - Cite exact `file:line` and a concrete failure scenario for every finding.
   - In round 2+, include the updated diff, a short list of what changed since the prior round, and an instruction to stay within the original change's scope.

2. **Verify and filter findings:** check every candidate finding against the code and drop any that do not hold. Select every verified **3/3** finding and **2/3 must-fix** finding. Ignore 1/3 findings and 2/3 non-blocking nits.

3. **Check stopping conditions:**
   - **All 3 delegates scored `>= minScore` and no qualifying findings remain:** exit the loop as done.
   - **`round == maxRounds` and the target score is still not reached:** stop without starting another round. Report the round-by-round scores, list what is still holding the score down, and give a clear recommendation on whether continuing is worthwhile or hitting diminishing returns so the user can decide.
   - **A delegate scored `< minScore` but no 3/3 or 2/3 must-fix findings remain:** check whether any remaining sub-`minScore` feedback is a real, in-scope defect worth fixing. If yes, fix it and continue. If only style nits or scope creep remain, stop and ask the user before churning further.

4. **Apply fixes and verify:** fix only the selected in-scope findings. Fight scope creep across rounds. Run relevant checks (tests, lint, typecheck) and confirm they pass before starting the next round.

## 3. Report in chat

- Show the round-by-round score table using the delegate names from `council-members`.
- Summarize what was fixed in each round and which checks ran.
- If stopped early or at `maxRounds`, clearly explain the remaining feedback and whether another round makes sense.
