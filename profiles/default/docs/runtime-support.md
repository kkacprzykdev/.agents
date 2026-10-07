# Runtime support in `default`

Core's [`docs/runtime-support.md`](../../../docs/runtime-support.md) covers what each runtime mapping links and the format differences between runtimes. This file covers how this profile's artifacts use them.

- Cursor is the runtime the daily workflow is written and tested in.
- Transcript discovery is runtime-neutral. The summarize-chat and work-state commands go through the `resolve-agent-sessions` skill, which calls the chatpicker resolver. chatpicker has locators for Cursor and Claude Code. Other runtimes get links once chatpicker learns their layout.
- Every rule in this profile uses `alwaysApply: true` with no `globs`, so each one loads on every run in both Cursor and Claude.
- The daily cross-runtime workflow does not need subagents, so linking them into Cursor only is enough for this Lineage.
