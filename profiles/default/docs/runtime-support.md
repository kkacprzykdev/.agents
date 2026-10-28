# Runtime support in `default`

Core's [`docs/runtime-support.md`](../../../docs/runtime-support.md) covers what each runtime mapping links and the format differences between runtimes. This file covers how this profile's artifacts use them.

- Cursor is the runtime the daily workflow is written and tested in.
- Transcript discovery is runtime-neutral. The summarize-chat and work-state commands go through the `resolve-agent-sessions` skill, which calls the chatpicker resolver. chatpicker has locators for Cursor and Claude Code. In Codex and other runtimes, a session header holds the agent's name until chatpicker learns their layout.
- Every rule in this profile is a Cursor `.mdc` rule with `alwaysApply: true` and no `globs`. So each one loads on every run in Cursor, Claude, and Codex.
- The commands use no positional placeholders, so Cursor and Claude get plain links. Codex users invoke them as `$<name>`, such as `$summarize-chat-new`.
- This profile has no subagents. The daily workflow does not need them.
