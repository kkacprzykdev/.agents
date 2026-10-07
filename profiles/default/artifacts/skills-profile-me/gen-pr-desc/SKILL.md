---
name: gen-pr-desc
description: Generate a pull request description with `### Motivation` and `### Proposed changes`. Use when writing a GitHub PR body, a PR description, or Feature Overview in a chat summary, or when adding "See details" code blocks under its items.
---

# Generate a PR description

## Context source

When this skill writes a GitHub PR body — slash command, the user named this skill, or they asked for a PR description — use these context sources (all of them, in this priority order):

1. **Current chat conversation** — primary source for understanding motivation, intent, and what was done
2. **Git changes for this PR** — take every change that would show up on the pull request: unstaged, staged, committed on this branch, or already pushed. Compare against the PR base, not only `HEAD`. When a PR exists, use that PR's diff. Otherwise diff this branch and the working tree against the default or upstream base. `git diff HEAD` or `git diff --staged` alone is not enough once the branch has commits. Verify what actually changed to ensure accuracy of "Proposed changes".
3. **Files and URLs the user already attached, named, or pasted** — summaries, tickets, docs. If this chat already contains the contents or a prior investigation of that file or URL, reuse it. If it does not, read the file or fetch the URL. Do not ask whether to use them. Do not search for extra files or URLs.

When this skill runs for **Feature Overview in a chat summary**, use the context sources that summary command already named.

If the user pasted a ticket URL, include it in Motivation. Do not invent a tracker URL.

### Context prioritization for accuracy

Regardless of the context source, always prioritize the **user's own words** (their exact prompts, explanations, and stated goals) over mechanical code-level observations. The user's prompts are the most reliable source for understanding *why* the work was done and what problem it solves — code diffs only show *what* changed. When the user explicitly described their motivation, design choices, or goals, reflect those in the PR description rather than inferring intent from code alone.

Generate a description that:

1. **MUST be formatted as markdown** - The output must use markdown syntax (headers with `###`, links with `[text](url)`, bullet lists with `-`, etc.). Do NOT output plain text. The required output wrapper below is the heading format.
2. is concise and short
3. is based on the following template:

```markdown
### Motivation
### Proposed changes
```

**Hard requirement for output shape**
- Return the final answer as **one fenced code block** with language tag `markdown`
- Inside that block, the text must start with `### Motivation` and then `### Proposed changes`
- Do not add explanation text outside the fenced block. The one exception is the closing See details offer after the block.
- This requirement exists so raw markdown symbols like `###` stay visible to the user

**Feature Overview in a chat summary:** write those two headings as markdown under `## 1. Feature Overview`. Do not wrap Feature Overview in a fenced code block.

Guidelines for "Proposed changes" section:

- Keep it high-level and describe WHAT was done, not HOW
- Do not list specific files or implementation details - the code changes should be self-descriptive
- Focus on the user-facing or functional outcome
- Prefer a bullet list — one outcome per item, each written as a natural sentence or two
- **Exclude** internal refactoring that doesn't change behavior (extracting functions, moving files between directories, renaming variables) — these are implementation mechanics, not outcomes
- **Include** test coverage additions at a high level (e.g., "Added unit tests covering all access check scenarios") — test coverage signals quality and completeness to reviewers, even though it's developer-facing

**See details blocks:** Finish the whole description first, with no questions along the way. Then end your final message with the See details offer from [SEE-DETAILS.md](SEE-DETAILS.md). Read that file in full and follow it. Write blocks only after the user replies. The guidelines above shape the bullets. Inside a See details block, files and implementation details are the point.

**Do not include anywhere in the PR description**:

- Agent chat IDs or paths to chat transcripts
- Absolute paths on the author's machine (e.g. under `~/`) — reviewers cannot open them
- **Local / monorepo workflow only** — things the author needs on their machine but reviewers and CI do not need in the PR text.

**Writing style:** Follow the always-applied rule **`teammate-prose`** (`~/.agents/profiles/default/artifacts/rules-profile-me/teammate-prose.mdc`) for all PR-facing prose — `### Motivation`, `### Proposed changes`, and every optional section you add (`### Unrelated changes`, `### Notes`, mitigation strategies, etc.). Read that rule before you write. Do not rely on memory. Section-specific content rules stay in this file below.

Guidelines for "Motivation" section:
- Focus on the product/user problem or request that triggered the change
- Do not include obvious process notes like "tests needed to be fixed" unless test reliability itself is the main goal
- Avoid unexplained internal acronyms (for example: write the full phrase instead of shortcuts like "SLA")

**IMPORTANT:** Output must use markdown syntax, not plain text. The wrapper below is the required heading format. It is not a product story.

Required output wrapper:

```markdown
### Motivation
...

### Proposed changes
...
```
