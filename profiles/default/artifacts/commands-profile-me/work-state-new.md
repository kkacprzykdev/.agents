---
---

# Create New Work State File

Create a new `WORK_STATE_*.md` file from the current chat context.

**Storage:** Resolve the Active profile (`profile-references.mdc`). Write under Output map kind `work-state`. **Session discovery:** `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md`. **Past Chat References layout:** `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`.

## Slash Command

Analyze the current chat and create **one** new work-state file: a high-level local checklist, an epic ticket pointer, or an implementation breakdown of one epic item (often alongside a separate epic pointer file). **Do not add `## Plan` unless the user explicitly asks you to.**

### 🛑 CRITICAL: Timestamp Rules 🛑

1. **Generation Command:** Execute `TZ='Europe/Warsaw' date '+%Y-%m-%d-%H-%M-UTC%z'` to get the exact current timestamp. Use this command only — do not invent or approximate timestamps.
2. **On create:** Set both `**Created**:` and `**Updated**:` to that timestamp only — no parenthetical note.

### 🛑 CRITICAL: Filename & Counter Rules 🛑

1. **Directory:** the `work-state` kind path from the Active profile Output map
2. **Pattern:** `WORK_STATE_<NNN>_<slug>.md`
   - `<NNN>`: next global 3-digit counter (`000`, `001`, …). Scan existing files; use `max(NNN) + 1`. Never renumber existing files.
   - `<slug>`: lowercase kebab-case, derived from title or primary ticket (e.g. `proj-123-feature-name`, `filters-compact-layout`). Include ticket key in slug when the file is primarily a pointer to one ticket.
3. **Do not put dates in the filename.**

### 🛑 CRITICAL: Existing File / Checklist — Read From Disk 🛑

This command **creates a new** work-state file. To update an existing checklist, use **`work-state-update`** instead.

If the user references an existing `WORK_STATE_*.md` (merge, copy checklist, or “continue from” a file), use the Read tool to load the **entire** file from disk first. **Do not** use chat cache or an old @-mention as the checklist source — the user may have edited the file manually outside the agent.

### Before Writing

1. **Clarify intent from chat** — pick the checklist pattern (see **Layered checklists** below). Common cases:
   - **Epic pointer only** — milestone checklist lives in a ticket; local file links to it (no local bullets).
   - **Local implementation checklist** — detailed progress here; may link to an epic ticket and subtask tickets per bullet.
   - **Both** — epic pointer file *and* a separate local file that breaks down one epic item (e.g. `WORK_STATE_000` → PROJ-1000 epic, `WORK_STATE_001` → V1.1 analytics phases).
2. **Tickets:** Use full URLs for any ticketing system (`[label](https://...)`). Prefer `**Primary ticket**:` for the ticket that owns the epic/milestone checklist or the main scope of this file.
3. **Pull requests / merge links:** When a checklist step has an associated PR or merge request, append it **inline** on that bullet (any host: GitHub, GitLab, Bitbucket, etc.). Use full URLs and a short label (e.g. `[#63058](https://github.com/org/repo/pull/63058)`, `[!42](https://gitlab.com/...)`). Keep ticket links on the same bullet when both apply — ticket first or PR first is fine; stay consistent within a file.
4. **Do not mirror the full epic checklist** from a ticket into this file — that stays in the ticket. **Do** add local bullets that break down one epic milestone into phases/steps when the user is implementing it.
5. **Sessions / chats:** Read session discovery and vault session-reference skills from disk (see below) for the current session and any linked sessions.

### Layered checklists (ticket + local)

Checklists often exist at **two levels at once** — this is normal, not a conflict:

| Level | Where | Granularity | Example |
|-------|--------|-------------|---------|
| **Epic / milestone** | Ticket description (Jira, etc.) | Coarse — version milestones, current-state roll-up | PROJ-1000: `🚧 Analytics events (V1.1)` |
| **Implementation** | Local `WORK_STATE_*.md` | Finer — phases, PRs, verify steps | Phase 1 stop bleeding → Phase 2 filters |

**Rules:**

- **Local is more detailed than the ticket.** The ticket item is the umbrella; local bullets are how you implement it correctly (e.g. split V1.1 into Phase 1 / Phase 2).
- **Two files for one epic is OK.** Epic pointer file (`Primary ticket` + “progress in ticket”) + separate local file for a sub-scope with its own `## Checklist`.
- **Cross-link:** Local file → epic via `**Primary ticket**:` or `## Related tickets`. Epic pointer → local file via a line under `## Related chats` or `## Related tickets` when the user wants that link recorded.
- **Progress ownership:** Update **local checkboxes** from the hub chat / `work-state-update`. Update the **ticket milestone** (e.g. ✅ V1.1) when the user confirms the epic item is done — do not auto-sync ticket checkboxes from local unless asked.
- **Never copy** the ticket’s full “Current state” list into a local file. **Do** name which epic item the local checklist implements (e.g. in `**Goal**:` or a one-line note under `## Checklist`).

### 🛑 CRITICAL: Header Fields (Title Section) 🛑

Immediately under the `#` title, these three fields are **mandatory** on every work-state file:

| Field | Required | Notes |
|-------|----------|--------|
| `**Created**:` | Yes | Timestamp only; set once on create; never change on update |
| `**Updated**:` | Yes | Timestamp only; same as `Created` on create; refresh on every update |
| `**Slug**:` | Yes | Kebab-case; must match the `<slug>` in the filename |

**All other header lines are optional** — add only when relevant to this work item, for example:

- `**Primary ticket**:` — epic or scope ticket URL (milestone checklist usually in ticket description; local file may break down one item)
- `**Checklist hub chat**:` — agent session that owns checklist updates (see session linking rules)
- `**Sessions path**:` — the resolver's `header` (agent name plus store root), **or** the agent name alone if it has no transcript files
- `**Goal**:` or other free-form context lines the user wants at the top

Do not invent optional fields unless they help this specific work stream.

### 🛑 CRITICAL: Session linking — read skills from disk 🛑

**MANDATORY before writing session links** — use the Read tool to open these files **in full** (do not rely on memory or duplicated rules in this command):

1. `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc` — **HOME_FILE_URI** and `file://` link rules
2. `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md` — find the current session and resolve every linked session with the chatpicker resolver
3. `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md` — `**Sessions path**:`, `**Checklist hub chat**:`, `## Related chats`, checklist inline links

Apply those specs for all session references in this file.

### 🛑 CRITICAL: `## Plan` Section — Do Not Touch Unless Asked 🛑

**Default: omit `## Plan` entirely.** Planning detail usually lives in chats, tickets, or summaries — link those via `## Related chats`, `**Primary ticket**:`, or checklist bullets. Never add placeholder text explaining that the plan lives elsewhere.

**Only add `## Plan` when the user explicitly asks** (e.g. “add a plan section”, “write the implementation plan into the work state”). If they did not ask, **do not** create the section, **do not** summarize chat discussion into `## Plan`, and **do not** infer that a detailed plan should be captured.

**Purpose of `## Plan`:** a human-refined handoff document used later to **spin up an agent to implement** that scope. It is not a running log of design chat.

**When the user did ask for `## Plan`:**

- Write only what they approved or dictated in this chat; they refine the plan — the agent does not improvise scope.
- Do not paste long auto-generated plans from conversation unless they explicitly requested that capture.

### Density & Style (Human + Agent)

- **Checklist:** High-level titles only (phase headers + a few bullets). No step-by-step implementation unless the user explicitly asked for detail in this file. If this file implements one epic milestone, say so once (e.g. in `**Goal**:` or under `## Checklist`) — do not copy the ticket’s full current-state list.
- **Hybrid links (per checklist bullet):** append suffixes with ` — ` separators, only when they exist:
  - Ticket: `— [PROJ-123](https://...)`
  - Merged/open PR or MR: `— [#63058](https://github.com/.../pull/63058)` (GitLab, Bitbucket, etc. — any merge-request URL)
  - Session: ``— [Short title](<transcript-uri>) — `<session-id>` `` where `<transcript-uri>` is the resolver's `uri` (`resolve-agent-sessions`)
  - Chat summary: `— [summary label]({HOME_FILE_URI}<chat-context-summary-kind-after-HOME_PATH>/CHAT_CONTEXT_SUMMARY_….md)` — resolve the kind directory from the Active profile Output map; see `vault-session-references` and `local-file-uri-links.mdc`
  - File-level: `**Primary ticket**:` and/or `**Checklist hub chat**:` with optional `↳ Session:` (see `vault-session-references` skill).
- **Preserve user wording** for checklist items when the user pasted or approved them in chat.

### Required File Template

```markdown
# [Human-readable title]

**Created**: [INSERT_TIMESTAMP_FROM_COMMAND_HERE]
**Updated**: [INSERT_TIMESTAMP_FROM_COMMAND_HERE]
**Slug**: [kebab-slug]

[Optional: **Primary ticket**:, **Checklist hub chat**:, **Sessions path**:, **Goal**:, etc.]

## Checklist

[High-level `- [ ]` / `- [x]` items; optional inline ticket + PR/MR + session links — or pointer text if this file is epic-only (no local breakdown)]

[## Plan — only if user explicitly asked; see Plan rules above]

## Related chats

[Numbered list — per vault-session-references skill]

## Related tickets

[Optional index of secondary ticket URLs not already in header or bullets]
```

Omit optional header lines and optional sections when not applicable. Never add empty `## Plan` or “no local plan” boilerplate.

### After Creating

Tell the user the absolute path to the new file and the filename counter used. If checklist updates should happen only in a specific chat, state that explicitly.
