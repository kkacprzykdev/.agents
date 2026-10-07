---
---

# Generate Initial Chat Context Summary

Create a new summary file. Filename `CHAT_CONTEXT_SUMMARY_[TIMESTAMP]_[PROMPT_FEATURE_NAME].md`.

**Storage:** Resolve the Active profile (`profile-references.mdc`). Write under Output map kind `chat-context-summary`. **Session discovery:** `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md`. **Past Chat References layout:** `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`.

## Slash Command

Analyze the current chat and generate a dense, high-level technical summary.

### 🛑 CRITICAL: Timestamp & Git State Rules 🛑

1.  **Generation Command:** Execute `TZ='Europe/Warsaw' date '+%Y-%m-%d-%H-%M-UTC%z'` to get the exact current timestamp.
2.  **Placement:** It MUST go into the `**Generated**:` field in the header.
3.  **Branch:** Execute `git branch --show-current` in the relevant repo to get the current branch name. Place it in the `**Branch**:` header field. Each summary corresponds to one PR, and one PR corresponds to one branch, so this field MUST always be present.
4.  **Repository:** Execute `git rev-parse --show-toplevel` in the relevant repo to get the absolute path of the repository root. Place it in the `**Repository**:` header field. This identifies which repo/worktree the changes were made in, so the user can later find the local branch.
5.  **Pull request:** If the user shared a PR URL in this chat, or you created/opened a PR for this work (`gh pr create`, `gh pr view`, user asked to update the PR), place the full PR URL in `**Pull request**:`. If no PR exists yet, omit this field entirely (do not write `(none)` or a placeholder).

### 🤖 Target Audience: AI Agent (Crucial for Cost Saving)

This summary is for another AI instance, NOT a human.
* **Use Technical Shorthand:** Prefer dense jargon over verbose explanations.
* **Assume Knowledge:** Do not explain standard patterns. Only document *deviations*.
* **Assume Lazy Loading:** Future agents will ONLY read files from the "Critical Files" list if they are directly relevant to the *new* user prompt. Do not summarize file contents to compensate for this.

### Crucial Instructions for Density

* **Absolute NO to Full Files:** Never paste full file contents.
* **No Chat Replays:** Zero conversational history.
* **Focus on Current State:** Only document what currently exists or is actively broken.
* **Targeted Code Snippets Allowed:** For non-obvious patterns or constraints, include a code snippet of **max 3 lines** that demonstrates the correct pattern. Wrap in fenced code blocks. Never include snippets for self-evident patterns.

### Required Sections

1.  **Feature Overview (= PR Description)**: This section serves double duty — it IS the pull request description that will be copy-pasted into GitHub. It contains `### Motivation` and `### Proposed changes` per the Active profile **PR description generator**. See **PR Description Generation Rules** below.
2.  **Architecture & Key Decisions**: Major technical decisions and their rationales. Focus on **non-obvious** decisions: API quirks, workarounds, unintuitive parameter choices, DI wiring gotchas, async patterns, timing issues, type system workarounds. These survive compression better than self-evident decisions. The test: "Would a future agent re-discover this the hard way if it's not documented?"
3.  **Constraints & Anti-Patterns**: List approaches that failed and rigid constraints to prevent regressions. Include a **max 3-line code snippet** when the correct pattern is non-obvious.
4.  **Current Implementation State**:
    * **Completed**: Dense list of capabilities with verification method (e.g., `[Verified: Unit Test]`, `[Verified: Manual]`).
    * **Known Issues**: Explicit bugs/blockers discovered during implementation.
5.  **Critical Files**: Files essential for this feature's unique logic.
    * **Reference Files** *(optional)*: Files that were important but are now completed/stable. Agent should NOT proactively read these unless the user's prompt specifically touches them.
6.  **Past Chat References**: Two subsections — see rules below.

### Past Chat References — Rules

**MANDATORY before writing this section** — read in full from disk (do not rely on memory):

1. `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc` — **HOME_FILE_URI** and `file://` link rules
2. `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md` — find the current session and resolve every linked session with the chatpicker resolver
3. `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md` — Past Chat References layout, `**Transcripts path**:` header, entry format

Apply those specs for discovery, header fields, and transcript links. Every transcript link target is the resolver's `uri`. Never build it from a path template.

**`### Summary Sessions`** and **`### Related Chats`** — rules and entry format are in `vault-session-references` skill. Do not duplicate here.

### PR Description Generation Rules

The `## 1. Feature Overview` section contains `### Motivation` and `### Proposed changes` — this is the actual PR description the user will paste into GitHub.

**🛑 MANDATORY first step — PR-facing prose:** Before writing `## 1. Feature Overview`, resolve the Active profile (`profile-references.mdc`), then read IN FULL: (a) `~/.agents/profiles/default/artifacts/rules-profile-me/teammate-prose.mdc` — teammate voice, no semicolons, full sentences; (b) the artifact path in Active profile references/shared.md **PR description generator**. Every profile defines this section. If you do not find it, stop and tell the user. Do not substitute another generator. Do NOT skip either. Do NOT rely on memory. Other summary sections stay dense agent shorthand.

**Summary-specific context sources** (use all, in this priority order):
1. **Current chat conversation** — primary source for understanding motivation, intent, and what was done
2. **Git changes for this PR** — take every change that would show up on the pull request: unstaged, staged, committed on this branch, or already pushed. Compare against the PR base, not only `HEAD`. When a PR exists, use that PR's diff. Otherwise diff this branch and the working tree against the default or upstream base. `git diff HEAD` or `git diff --staged` alone is not enough once the branch has commits. Verify what actually changed to ensure accuracy of "Proposed changes".
3. **Files and URLs the user already attached, named, or pasted** — summaries, tickets, docs. If this chat already contains the contents or a prior investigation of that file or URL, reuse it. If it does not, read the file or fetch the URL. Do not ask whether to use them. Do not search for extra files or URLs.
4. **Summary content being generated** — use the Architecture, Constraints, and Implementation State sections you're writing to inform the PR description

**Summary-specific output rule:** Do NOT wrap the PR description in a fenced code block. Write `### Motivation` and `### Proposed changes` directly as markdown headings inside `## 1. Feature Overview`.

**PR-facing only in Feature Overview:** Keep transcript paths, agent chat IDs, and absolute `~/` machine paths out of Feature Overview.

**Human refinement note:** It is very likely that user manually tweaked the PR description after generation (wording, tone, structure). Future updates via the update command will read the current content first and preserve those manual edits.

### Output Format

```
# Chat Context Summary - [Feature Name]

**Generated**: [INSERT_TIMESTAMP_FROM_COMMAND_HERE] (Brief description of what changed)
**Feature**: [PROMPT_FEATURE_NAME]
**Branch**: [INSERT_BRANCH_NAME_FROM_COMMAND_HERE]
**Repository**: [INSERT_REPO_ROOT_PATH_FROM_COMMAND_HERE]
**Pull request**: [FULL_GITHUB_PR_URL — omit this line if no PR yet]
**Transcripts path**: [RESOLVER_HEADER, e.g. Cursor (/Users/me/.cursor/projects), or agent name if it has no transcript files]

## 1. Feature Overview

### Motivation
[Product/user problem. Jira link if available.]

### Proposed changes
[High-level description of what was done.]

## 2. Architecture & Key Decisions
...

## 3. Constraints & Anti-Patterns
- **Do NOT ...**: reason.

## 4. Current Implementation State

### Completed
...

### Known Issues
...

## 5. Critical Files
1. `path/to/file.ts` — description
...

### Reference Files
- `path/to/stable/file.ts` — description (completed, stable)

## 6. Past Chat References

### Summary Sessions

1. [Short title](<transcript-uri>) — `<session-id>` — Dense one-line summary

### Related Chats

1. [Short title](<transcript-uri>) — `<session-id>` — Why this chat is relevant
```

## Before you finish

- [ ] Resolved the artifact path in Active profile references/shared.md **PR description generator**, read that artifact and `~/.agents/profiles/default/artifacts/rules-profile-me/teammate-prose.mdc` in full, applied them to **Feature Overview**, and named the generator file you used.
- [ ] No semicolons in Feature Overview; no `WORK_STATE` / batch labels in user-facing prose.
