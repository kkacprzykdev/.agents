---
---

# Update Existing Chat Context Summary

Update the most recent summary file that matches `CHAT_CONTEXT_SUMMARY_*_[PROMPT_FEATURE_NAME].md`.

**Storage:** Resolve the Active profile (`profile-references.mdc`). Use Output map kind `chat-context-summary`. **Session discovery:** `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md`. **Past Chat References layout:** `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`.

## Slash Command

Analyze the current chat and MERGE its key technical developments into the existing summary file.

### 🛑 CRITICAL: Timestamp & History Rules 🛑

1.  **Generation Command:** ALWAYS execute `TZ='Europe/Warsaw' date '+%Y-%m-%d-%H-%M-UTC%z'` for NEW timestamps.
2.  **Preserve Generated:** Do NOT change the original `**Generated**:` line.
3.  **Promote Last Updated:** Rename any existing `**Last Updated**:` to `**Update N**:` (sequential from 1).
4.  **Insert New Last Updated:** Insert new `**Last Updated**:` line with CURRENT timestamp and a 3-5 word summary.
5.  **Preserve Branch:** Do NOT change the `**Branch**:` field. If it is missing (old summary), execute `git branch --show-current` in the relevant repo and add it to the header after `**Feature**:`.
6.  **Preserve Repository:** Do NOT change the `**Repository**:` field. If it is missing (old summary), execute `git rev-parse --show-toplevel` in the relevant repo and add it to the header after `**Branch**:`.
7.  **Pull request URL:**
    - **Preserve** an existing `**Pull request**:` value unless this session provides a newer authoritative URL for the same work.
    - **Set or update** when any of the following happened in the current chat: the user pasted or linked a PR URL; you created a PR (`gh pr create`) and have its URL; the user asked you to update the PR and the URL is known from tool output or `gh pr view --json url`.
    - Use the **full** PR URL (e.g. `https://github.com/org/repo/pull/12345`), not just the number.
    - If no PR exists and the field was never set, omit the line (do not add placeholders).
    - If the field is missing on an old summary but a PR URL is known from this session, add `**Pull request**:` after `**Repository**:`.

#### Exact Header Evolution (Strict Template)

**State 1: Initial**
```
# Chat Context Summary - [Feature Name]

**Generated**: 2025-11-01-10-00-UTC+0100 (Auth implemented with pagination)
**Feature**: [PROMPT_FEATURE_NAME]
**Branch**: [BRANCH_NAME]
**Repository**: [REPO_ROOT_PATH]
**Pull request**: [PR_URL — omit if none]
```


**State 2: After 1st Update**
```
# Chat Context Summary - [Feature Name]

**Generated**: 2025-11-01-10-00-UTC+0100 (Auth implemented with pagination)
**Last Updated**: [INSERT_TIMESTAMP_FROM_COMMAND_HERE] (Fixed login bug)
**Feature**: [PROMPT_FEATURE_NAME]
**Branch**: [BRANCH_NAME]
**Repository**: [REPO_ROOT_PATH]
**Pull request**: [PR_URL — omit if none]
```


**State 3: After 2nd Update**
```
# Chat Context Summary - [Feature Name]

**Generated**: 2025-11-01-10-00-UTC+0100 (Auth implemented with pagination)
**Update 1**: 2025-11-02-14-30-UTC+0100 (Fixed login bug)
**Last Updated**: [INSERT_TIMESTAMP_FROM_COMMAND_HERE] (Added user profile)
**Feature**: [PROMPT_FEATURE_NAME]
**Branch**: [BRANCH_NAME]
**Repository**: [REPO_ROOT_PATH]
**Pull request**: [PR_URL — omit if none]
```


### 🤖 Target Audience & Density Rules (Crucial)

* **AI-to-AI Density:** Use dense technical shorthand. Assume the next reader is an expert AI who will lazy-load files.
* **NO Verbatim Transcripts:** Do NOT include conversational back-and-forth.
* **NO Full File Contents:** Do NOT paste full files.
* **Targeted Snippets OK:** Max 3-line code snippets for non-obvious patterns in Constraints section.

### ⚡️ Section Maintenance Rules

You must maintain the strict structure of the original file.

#### Feature Overview (= PR Description) — Incremental Update Protocol

The `## 1. Feature Overview` section contains the PR description (`### Motivation` and `### Proposed changes`) mandatory sections.

On each update:

1.  **🛑 MANDATORY first step — PR-facing prose:** Before ANY edit under `## 1. Feature Overview`, resolve the Active profile (`profile-references.mdc`), then read IN FULL: (a) `~/.agents/profiles/default/artifacts/rules-profile-me/teammate-prose.mdc` — teammate voice, no semicolons, full sentences; (b) the artifact path in Active profile references/shared.md **PR description generator**. Every profile defines this section. If you do not find it, stop and tell the user. Do not substitute another generator. Do NOT skip either. Do NOT rely on memory. Sections outside Feature Overview (Architecture, Constraints, etc.) stay dense agent shorthand.
2.  **Read in full the existing `### Motivation` and `### Proposed changes`** before making any changes. The user very likely manually refined the wording, tone, or structure after the last generation — treat the current content as the latest authoritative version and preserve the user's phrasing.
3.  **Context sources** for updating (use all, in this priority order):
    - **Current chat conversation** — primary source for understanding motivation, intent, and what was done
    - **Git changes for this PR** — take every change that would show up on the pull request: unstaged, staged, committed on this branch, or already pushed. Compare against the PR base, not only `HEAD`. When a PR exists, use that PR's diff. Otherwise diff this branch and the working tree against the default or upstream base. `git diff HEAD` or `git diff --staged` alone is not enough once the branch has commits. Verify what actually changed to ensure accuracy of "Proposed changes".
    - **Files and URLs the user already attached, named, or pasted** — summaries, tickets, docs. If this chat already contains the contents or a prior investigation of that file or URL, reuse it. If it does not, read the file or fetch the URL. Do not ask whether to use them. Do not search for extra files or URLs.
    - **Existing summary content** — use the Architecture, Constraints, and Implementation State sections in the file you are updating (including this pass) to inform incremental Feature Overview edits. Do not rewrite Motivation or Proposed changes from scratch.
4.  **Incremental updates only** — do NOT rewrite from scratch. Preserve manual edits. Instead:
    - **`### Motivation`**: Only change if the fundamental problem/goal has shifted. Usually stays stable after initial generation.
    - **`### Proposed changes`**: Add new bullet points for newly completed work. Modify existing bullets if the approach changed. Remove bullets only if the described change was reverted.
5.  If `## 1. Feature Overview` exists but does NOT have `### Motivation` and `### Proposed changes` sections (old format), convert it: move the existing content into `### Motivation` (rewrite as user problem) and generate `### Proposed changes` from the current Implementation State + git diff.
6.  **Output rule:** Do NOT wrap the PR description in a fenced code block. Write `### Motivation` and `### Proposed changes` directly as markdown headings inside `## 1. Feature Overview`.
7.  **PR-facing only in Feature Overview:** Keep transcript paths, agent chat IDs, and absolute `~/` machine paths out of Feature Overview.

#### Architecture & Key Decisions
If a new decision was made, ADD it — especially **non-obvious** decisions (API quirks, workarounds, unintuitive parameter choices, DI wiring gotchas, async patterns, timing issues). The test: "Would a future agent re-discover this the hard way if it's not documented?" If an existing decision is no longer relevant (the code it describes has been removed or completely superseded), REMOVE it with a note in your commit message.

#### Constraints & Anti-Patterns

1.  If a new anti-pattern was discovered, ADD it with optional code snippet (max 3 lines).
2.  **Pruning (every update):** Review existing constraints. Delete those that relate to one-time mistakes unlikely to recur or that are obvious from reading the code. Keep everything that feels important — no hard limit.

#### Current Implementation State

* **Completed — Append-Only Rule:** NEVER remove an item from "Completed". Only ADD new entries or update `[Verified: ...]` tags.
* **Known Issues:** Apply **Promote or Perish** — if a fix requires a permanent constraint, move it to "Constraints & Anti-Patterns". Otherwise delete if resolved.

#### Critical Files

1.  Add new critical files as they emerge. Remove files that are no longer central to the feature.
2.  Optionally use a **Reference Files** subsection for files that were critical earlier but are now completed/stable. If the summary doesn't have one, create it when useful.

#### Past Chat References

**MANDATORY before appending entries** — read in full from disk:

1. `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc` — **HOME_FILE_URI** and `file://` link rules
2. `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md` — find the current session and resolve every linked session with the chatpicker resolver
3. `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`

Then follow `summarize-chat-new.md` § Past Chat References for subsection rules and entry format.

**`### Summary Sessions`** — APPEND the current chat as a new numbered entry. **Never remove existing entries.**

**`### Related Chats`** *(optional)* — APPEND only if this session surfaced a new related chat worth linking. Session ids only, never summary filenames. Omit the subsection if empty.

Set `**Transcripts path**:` to the resolver's `header` when it is missing or still names a single project folder (`vault-session-references`).

### ✅ Strict Quality Assurance Checklist

* [ ] **Timestamp Verification:** I executed the `TZ='Europe/Warsaw'...` command and inserted the EXACT output into the header.
* [ ] **History Preservation:** I checked the previous `Last Updated` entry. If one existed, I renamed it to `Update N` BEFORE adding my new entry.
* [ ] **Density Audit:**
    * I confirm there are ZERO verbatim chat logs in this summary.
    * I confirm there are ZERO full file dumps (only targeted ≤3-line snippets where non-obvious).
* [ ] **Constraint Pruning:**
    * I reviewed existing constraints and deleted one-time or obvious ones.
    * All remaining constraints document non-obvious traps a future agent could hit.
* [ ] **Completed Append-Only:** I did NOT remove any existing "Completed" items. I only added or updated tags.
* [ ] **"Promote or Perish" Validation:**
    * *Self-Correction:* Did I just delete a "Known Issue"? If yes, did I add a corresponding constraint to "Architecture" to prevent regression? (If no constraint needed, just delete).
* [ ] **Critical Files:** Updated to reflect current/next work. Stable files moved to Reference Files if appropriate.
* [ ] **PR prose rules read:** I resolved the artifact path in Active profile references/shared.md **PR description generator**, then read that artifact and `~/.agents/profiles/default/artifacts/rules-profile-me/teammate-prose.mdc` in full before editing Feature Overview, and named the generator file I used.
* [ ] **PR Description Updated:** I reviewed the existing `### Motivation` and `### Proposed changes` and incrementally updated them. I did NOT rewrite from scratch. Wording follows **teammate-prose** (teammate voice, no semicolon chains) and the Active profile **PR description generator** (section content).
* [ ] **Past Chat References:** I appended the current chat under `### Summary Sessions`. Related chats (if any) are under `### Related Chats`, separate from Summary Sessions. The `**Transcripts path**:` header field exists.
* [ ] **Pull request:** If a PR URL was shared or created/updated in this session, `**Pull request**:` contains the full URL. Otherwise I preserved the existing value or omitted the field.
