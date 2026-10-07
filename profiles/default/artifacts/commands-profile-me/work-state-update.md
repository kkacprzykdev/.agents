---
---

# Update Existing Work State File

Update an existing `WORK_STATE_*.md` file from the current chat context.

**Storage:** Resolve the Active profile (`profile-references.mdc`). Use Output map kind `work-state`. **Session discovery:** `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md`. **Past Chat References layout:** `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`.

## Slash Command

Merge progress from the current chat into the target work-state file. **Do not create a new file** unless the user explicitly asks to split work into a new state file.

### 🛑 CRITICAL: Timestamp Rules 🛑

1. **Generation Command:** Execute `TZ='Europe/Warsaw' date '+%Y-%m-%d-%H-%M-UTC%z'` to get the exact current timestamp. Use this command only — do not invent or approximate timestamps.
2. **Preserve `**Created**:`** — never change it.
3. **Update `**Updated**:`** — replace with the new timestamp only — no parenthetical note.

### 🛑 CRITICAL: Target File 🛑

Resolve the file to update (in order):

1. User @-mentioned or gave an absolute/relative path to a `WORK_STATE_*.md` file.
2. User named a slug or ticket key — match `WORK_STATE_*_<slug>.md` or content containing that ticket URL/key.
3. User said “this work state” / “the checklist” — use context from the current chat (linked hub chat, ticket keys, or prior messages).
4. If ambiguous, list matching files under the `work-state` kind directory and ask once.

**Never change the filename** (counter and slug are stable).

### 🛑 CRITICAL: Read Checklist From Disk — No Cache 🛑

**Before changing anything**, use the Read tool to load the **entire** target `WORK_STATE_*.md` file from the `work-state` kind directory.

1. **Do not** rely on checklist content from earlier in this chat, from memory, from a partial @-mention, or from a previous turn’s snippet.
2. **Do not** assume checkbox state or bullet wording you “remember” is still accurate — the user often edits the file **manually outside the agent** (editor, another tool, etc.).
3. Read the **full file** (no `limit` / `offset` unless the file is enormous and you must paginate; then read all parts before editing).
4. Treat the on-disk `## Checklist` section as the **source of truth for local implementation progress**; merge chat-confirmed changes onto that version.

If the file changed on disk between your read and your edit, prefer a second read before writing.

### Layered checklists (ticket + local)

The user may maintain checklists at **two levels**:

| Level | Where | Who updates |
|-------|--------|-------------|
| **Epic / milestone** | Ticket description (e.g. Jira “Current state”) | User (or agent only when explicitly asked) |
| **Implementation** | This `WORK_STATE_*.md` file | Hub chat / `work-state-update` |

**Rules:**

- **Local bullets are finer-grained** than the ticket — e.g. ticket has one V1.1 item; local file has Phase 1 / Phase 2 with PR links.
- **Do not mirror** the ticket’s full epic checklist into this file on update.
- **Do not auto-check** the ticket milestone when local phases complete — unless the user asks you to update Jira.
- **Pointer files** (epic-only, no local breakdown): update `**Updated**:`, sessions, and related links only — not `## Checklist` body from ticket text.
- When all local phases for an epic item are done, **mention** that the corresponding ticket milestone may be ready to mark done (user updates Jira).

### Header Fields (Title Section)

**Mandatory** (must remain present; only `**Updated**:` changes on update):

- `**Created**:` — timestamp only; never modify
- `**Updated**:` — timestamp only; always refresh with new timestamp from the date command
- `**Slug**:` — never modify (must match filename slug)

**Optional** header lines (`**Primary ticket**:`, `**Checklist hub chat**:`, `**Goal**:`, etc.) — add, edit, or remove when the current chat requires it. Do not add optional fields unless they serve this work item.

### Update Rules

#### Checklist

- Start from the checklist you **just read from disk** (see above) — never from cached context.
- Apply checkbox changes (`[ ]` ↔ `[x]`) and add/remove bullets **only** from what the user confirmed in this chat or explicit diff context.
- Keep items **high-level**; do not expand into implementation substeps unless the user asked.
- **Preserve manual edits** to wording and order; prefer editing existing bullets over rewriting the whole section.
- Respect `**Checklist hub chat**:` — if present and the current chat is not that hub, only update checkboxes when the user explicitly requested an update from this chat; otherwise warn and suggest opening the hub chat.

#### Plan (`## Plan`) — do not touch unless asked

**This command updates checklist progress by default.** It does **not** maintain `## Plan`.

- **Never add, edit, or rewrite `## Plan`** on your own — even if planning was discussed in this chat, even if implementation finished, even if the plan in the file looks stale.
- **Only touch `## Plan` when the user explicitly asks** in this session (e.g. “update the plan section”, “add implementation plan to work state”, “fix the plan in WORK_STATE_001”).
- If the file has no `## Plan` section, **leave it omitted**. Do not add placeholders or summaries of where the plan lives.
- **Purpose of `## Plan` when present:** human-refined handoff for a **future implementation agent** — not something to sync from ongoing work.
- Never delete human-written `## Plan` content unless the user explicitly instructs you to.

#### Tickets (generic)

- Add/update `**Primary ticket**:` or bullet suffix `— [label](https://...)` for any ticketing URL.
- Add secondary tickets under `## Related tickets` when useful.

#### Pull requests / merge links

- When the user provides a PR, MR, or merge URL for completed (or in-progress) work, add it **inline on the matching checklist bullet** — do not only mention it in chat.
- Use full URLs; any host (GitHub, GitLab, Bitbucket, Azure DevOps, etc.) and a short label (`#63058`, `!42`, …).
- **Preserve** existing ticket and session suffixes on the same bullet; append PR links when missing.
- If a bullet was “Open PR” and the user says it merged, prefer one checked item with the merge link (e.g. `Client PR merged — [#63058](url) — [TICKET](url)`) unless the file already separates open vs merged steps.

#### Sessions / chats

**MANDATORY** — use the Read tool to open **in full** before adding or changing session links:

1. `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc`
2. `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md` — find the current session and resolve every linked session with the chatpicker resolver
3. `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`

Then: append the **current session** to `## Related chats` if needed; update `**Sessions path**:` / hub session / inline links per those specs.

When adding or fixing links to local files (summaries, transcripts, other work states), use **HOME_FILE_URI** absolute `file://` targets per `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc` — not relative paths, not `~` in link targets.

#### Pointer files (epic-only)

For files whose checklist lives entirely in a ticket (e.g. `_Epic-level progress is maintained in the primary ticket above._`): update `**Updated**:` and `## Related chats` / `## Related tickets` only. Do not pull ticket “Current state” bullets into `## Checklist`. Do not add or edit `## Plan`.

If a **separate local file** breaks down one epic item, update that local file’s checkboxes — not the epic pointer file.

### After Updating

Report: file path, what changed (checkboxes, new links), and reminder of hub-chat rule if applicable.
