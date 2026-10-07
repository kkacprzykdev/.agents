---
name: vault-session-references
description: How to embed session and transcript links in vault artifacts — work-state files, chat summaries, Related chats lists, header fields, and cross-links between vault files. Use when writing or updating WORK_STATE_*.md, CHAT_CONTEXT_SUMMARY_*.md, or any generated vault file that references agent sessions.
---

# Vault session references

How to **write** session references in vault artifacts. For discovering transcript paths read `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md`. For clickable link shape read `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc`. In the patterns below, `<transcript-uri>` is the `uri` the resolver prints and `<session-id>` is its `sessionId`. `{HOME_FILE_URI}` (vault cross-links only) is substituted from the Profile setup. Write real `file://` URIs into artifacts, not tokens.

## Goals

- Future agents can find the conversation where work was discussed or done.
- Formats work **with or without** on-disk transcript files.
- No hard dependency on one vendor’s directory layout or file extension.

## Optional header fields

Use in document headers when helpful (not all formats require every field):

| Field | Used in | When to set |
|-------|---------|-------------|
| `**Sessions path**:` | Work-state | The resolver's `header` for the current session, e.g. `Cursor (/Users/me/.cursor/projects)`. The agent name alone if it has no transcript files. |
| `**Transcripts path**:` | Chat summaries | Same value as Sessions path. Summaries use this field name. |

Write the value as plain text, without backticks. Replace an older value that names a single project or `agent-transcripts` folder when you update the file.
| `**Checklist hub chat**:` | Work-state | Session that **owns checklist updates** for this work item |

## What to link

**Include:** sessions that contributed implementation, planning the user cares about, or checklist ownership.

**Exclude (by default):** meta sessions (work-state updates, summary generation only, abandoned retries with negligible output) unless the user asks to list them.

## Work-state — `## Related chats`

Numbered list, chronological (oldest first). Each entry:

```markdown
N. [Short title ≤6 words](<transcript-uri>) — `<session-id>` — Dense one-line summary
```

- Resolve every entry via `resolve-agent-sessions`. Subagent and moved-chat transcripts do not follow the main-chat path shape.
- **Legacy `↳ Session:` lines:** omit when the title link already points at the transcript.

### Inline on checklist bullets (work-state)

When a bullet’s work was done in a **different** session than the checklist hub:

```markdown
- [x] Ship fix — [Auth fix session](<transcript-uri>) — `<session-id>`
```

Omit the link if no transcript file exists. Keep title + `` `<session-id>` ``.

## Chat summaries — Past Chat References

Two subsections in `## 6. Past Chat References`:

**`### Summary Sessions`** — chats that created or updated **this** summary file.

- On `summarize-chat-new`: add **only the current chat** (one entry).
- On `summarize-chat-update`: append the current chat.

**`### Related Chats`** *(optional — omit if none)* — other chats mentioned in conversation that did **not** create/update this summary.

- Use session ids only — never link to other summary filenames.
- Same entry format as Summary Sessions.

Entry format (both subsections):

```markdown
N. [Short title ≤6 words](<transcript-uri>) — `<session-id>` — Dense one-line summary
```

Set `**Transcripts path**:` in the summary header from the resolver's `header` when missing or when it still names a single project folder.

## Cross-links between vault files

Resolve the Active profile Output map (`profile-references.mdc`) before naming a storage directory. Summaries live in the `chat-context-summary` kind directory. Work-state files live in the `work-state` kind directory. Prose may describe those directories as the Active profile vault (inline code with the resolved path). They are not a single hardcoded folder.

Only **clickable** `[label](…)` targets use absolute `file://` URIs per `local-file-uri-links.mdc` (HOME_FILE_URI + the expanded kind path + filename). Do not use `~` or relative paths in the target.

### Summary from work-tracking

```markdown
[summary label](file://<absolute-chat-context-summary-kind>/CHAT_CONTEXT_SUMMARY_<timestamp>_<feature>.md)
```

### Summary from another summary

```markdown
[predecessor summary](file://<absolute-chat-context-summary-kind>/CHAT_CONTEXT_SUMMARY_<timestamp>_<feature>.md)
```

### Work-tracking from work-tracking

```markdown
[epic pointer](file://<absolute-work-state-kind>/WORK_STATE_<NNN>_<slug>.md)
```

With anchors: `...md#related-chats`

## Synced web chats (planned)

Exported web conversations may be stored as markdown under the Active profile vault (e.g. `chats/` or `sync/`). When linking those sessions:

- Use the same list formats above with `file://` URIs to the local markdown file.
- Do not assume IDE transcript layout or `.jsonl`.

Until sync exists, link web-only work by title + synthetic session id and omit the file link if there is no local file.
