---
name: resolve-agent-sessions
description: >-
  Resolves the current or a past agent session to its transcript file, file:// URI,
  and header value, using the chatpicker resolver (CHAT_PICKER_HOME in the Active
  profile .env). Agent-neutral. Use when linking agent sessions, discovering
  transcript files, or setting Sessions path or Transcripts path headers.
---

# Resolve agent sessions

Session discovery: which transcript file belongs to a session, and how to link it. Agent-specific facts (store roots, layouts, subagents, duplicate copies) live in chatpicker, not here. For vault artifact layout read `~/.agents/profiles/default/artifacts/skills-profile-me/vault-session-references/SKILL.md`. For clickable link rules read `~/.agents/profiles/default/artifacts/rules-profile-me/local-file-uri-links.mdc`.

## Setup

Read **CHAT_PICKER_HOME** from the Profile setup (`profile-references.mdc`, Read the Profile setup). If `.env` or the key is missing, stop and ask the user to run `ag setup`.

Read `{CHAT_PICKER_HOME}/README.md`. It lists the agents that have a locator doc and documents the resolver. Read the locator doc for the agent you are running in when you need layout details the resolver output does not answer.

## Workflow

1. **Know your agent.** You know which product runs you. If the chatpicker README has no locator for it, skip to step 5.
2. **Find the current session.** Pick a distinctive phrase from the user's latest message, without quotes, backslashes, or line breaks. Run:
   ```bash
   node {CHAT_PICKER_HOME}/bin/find-session.mjs --text "<phrase>"
   ```
   The current transcript is being written, so it is the newest match. This works the same for a main chat, a subagent, and a chat in any window.
3. **Resolve other sessions** by id or an 8+ character prefix:
   ```bash
   node {CHAT_PICKER_HOME}/bin/find-session.mjs <session-id>
   ```
4. **Use the output as is.** `uri` is the link target. `sessionId` goes in backticks after the link. `header` is the value for `**Sessions path**:` or `**Transcripts path**:`. Never build a transcript path or URI by hand, and never guess a folder from the repository name.
5. **No transcript.** The resolver exits 1 when nothing matches, and for cloud-agent ids that have no local file. Then write the title and `` `<session-id>` `` with no link. If there is no id either, use a synthetic `session-YYYY-MM-DD-HH-MM`. For an agent without a locator, the header value is the agent's name (e.g. `Codex`).

## Checks before writing

- The link target is the resolver's `uri`, starting with `file:///` and containing the home directory exactly once.
- Links you did not just create may be stale. Re-run the resolver for their id before copying them.
