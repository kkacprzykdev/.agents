# Runtime support

## Current state

The store is runtime-neutral by design, but runtime support is not yet equal.

**Cursor is the primary and fully configured runtime.** `ag sync` maps personally authored and third-party skills, commands, rules, and subagents into Cursor.

**Claude is configured for skills, commands, and rules.** `ag sync` links skills into `~/.claude/skills/`, commands into `~/.claude/commands/`, and rules into `~/.claude/rules/`. Subagents are not linked. This was verified against Claude Code 2.1.193.

Adding a runtime mapping to `sync/runtimes.yaml` only declares symlinks. It does not prove that the runtime understands every artifact format or provides equivalent behavior.

## Portability notes

### Commands

Files under `commands-profile-me/` use the Cursor command format. Claude Code still loads `~/.claude/commands/*.md` and follows symlinks, so they are linked as-is. Claude has merged commands into skills and calls commands the older format. A skill with the same name wins over a command.

Known differences:

- Claude reads the same frontmatter keys as skills, except `name` and `paths`. Without a `description`, it uses the first non-empty line of the body.
- Commands that name a Cursor tool, such as `AskQuestion`, should also allow "an equivalent structured prompt". Claude's tool is `AskUserQuestion`.
- A command that reads agent transcripts must find them for each runtime, because every runtime stores them in its own layout.

Longer term, commands could become user-invoked skills (`disable-model-invocation: true`), so one format serves every runtime.

### Rules

Files under `rules-profile-me/` use the Cursor rule format (`.mdc`). Claude Code loads user rules from `~/.claude/rules/`, recursively, and follows symlinks. It only loads files whose name ends in `.md`, so the Claude mapping uses `link-ext: .md`. Each link is named `x.md` and points at `x.mdc`.

Known differences:

- Claude reads only the `paths` frontmatter key. It ignores and strips `description`, `alwaysApply`, and `globs`.
- A rule without `paths` loads on every run. A rule with `alwaysApply: true` and no `globs` behaves the same in both runtimes.
- A rule that relies on Cursor `globs` would load always in Claude. Add a matching `paths` key if a rule ever needs file-scoped loading in both runtimes.
- Relative `@` imports resolve from the canonical file, not from the runtime folder. Rules should name files by absolute `~/.agents/...` paths instead.

Sources: [Claude Code skills and commands](https://code.claude.com/docs/en/skills), [Claude Code memory and rules](https://code.claude.com/docs/en/memory), and the [Claude Code changelog](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) (`.claude/rules/` since 2.0.64, commands merged into skills in 2.1.3).

### Subagents

Subagents are linked into Cursor only. Their portability to other runtimes has not been investigated.

A profile may record its own runtime notes, such as how its artifacts behave in each runtime, in its own docs.

## Desired future state

- Cursor keeps its current skill, command, rule, and subagent behavior.
- Claude stays practical for daily work with the same skills, commands, and rules as Cursor.
- Other runtimes such as Codex or T3 Code can use the same canonical recipes through verified mappings or adapters.
- Runtime-specific syntax stays at the edge. Shared behavior has one source of truth.
- A runtime is described as fully supported only after each mapped artifact kind is verified in that runtime.

This is a future investigation, not a settled migration design.
