# Runtime support in `default`

Core's [`docs/runtime-support.md`](../../../docs/runtime-support.md) covers what each runtime mapping links and the format differences between runtimes. This file covers how this profile's artifacts use them.

- Transcript discovery is runtime-neutral. The summarize-chat and work-state commands go through the `resolve-agent-sessions` skill, which calls the chatpicker resolver. chatpicker's README lists the agents it has locators for. For any other agent, a session header holds the agent's name.
- Every rule in this profile is a Cursor `.mdc` rule with `alwaysApply: true` and no `globs`. So each one loads on every run in Cursor, Claude, and Codex.
- The commands use no positional placeholders, so Cursor and Claude get plain links. Codex users invoke them as `$<name>`, such as `$summarize-chat-new`.