# Runtime support

## Current state

The store is runtime-neutral by design, but each coding agent receives a different set of artifact kinds.

**Cursor** receives skills, commands, rules, and subagents. `ag sync` links them into `~/.cursor/skills/`, `~/.cursor/commands/`, `~/.cursor/rules/`, and `~/.cursor/agents/`.

**Claude** receives skills, commands, rules, `CLAUDE.md`, and `AGENTS.md`. `ag sync` links skills into `~/.claude/skills/`, commands into `~/.claude/commands/`, rules into `~/.claude/rules/`, and the two instruction files into `~/.claude/` itself. Subagents are not linked. This was verified against Claude Code 2.1.193.

**Codex** receives store and profile skills, `AGENTS.md`, and `CLAUDE.md`. `ag sync` links the skills into `~/.codex/skills/` and the two instruction files into `~/.codex/` itself. Codex reads third-party skills from `~/.agents/skills/` on its own.

Adding a runtime mapping to `sync/runtimes.yaml` only declares symlinks. It does not prove that the coding agent understands every artifact format or provides equivalent behavior.

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

Subagents are linked into Cursor only. Their portability to other coding agents has not been verified.

### Global instructions files

A profile keeps its `AGENTS.md` and `CLAUDE.md` in `artifacts/instructions-profile-me/`. That folder holds only these two files. `ag sync` links both files into the Agent home of Claude and of Codex. In the Agent home itself, sync manages only these two names. It never removes or lists any other file or symlink there, such as `~/.claude/settings.json`.

Claude reads `~/.claude/CLAUDE.md`, and Codex reads `~/.codex/AGENTS.md`. A Root profile starts with an empty `AGENTS.md` and a `CLAUDE.md` that holds `@~/.claude/AGENTS.md`, so both get one text. The import uses the link in `~/.claude/`, because a relative import resolves next to the real `CLAUDE.md`, and the two files can sit in different profiles of a Lineage. That is why both files go into both homes.

Cursor reads neither file globally, so they are not linked into `~/.cursor/`. A global instruction for Cursor is a rule with `alwaysApply: true`.

Only one profile in a Lineage can have each file. A second one is a Collision.

### Codex

Codex lists `~/.agents/skills/` as the folder for user skills. It also reads `~/.codex/skills/`. The store's third-party `skills/` folder is `~/.agents/skills/`, so Codex already sees those skills. The Codex mapping sets `reads-store-skills: true`, and `ag sync` links only store and profile skills into `~/.codex/skills/`. A link to a third-party skill there would show it twice.

Codex reads global instructions from `~/.codex/AGENTS.md`.

Commands, rules, and subagents are not linked into Codex:

- Codex CLI 0.117.0 removed custom prompts, its form of commands.
- `~/.codex/rules/` holds command-approval rules, not instructions.
- Codex subagents are TOML files, not the Markdown format of the store's subagents.

Sources: [Codex skills](https://developers.openai.com/codex/skills) and [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

A profile may record its own notes, such as how its artifacts behave in each coding agent, in its own docs.

## Desired future state

- Cursor keeps its current skill, command, rule, and subagent behavior.
- Claude and Codex stay practical for daily work with the same recipes as Cursor.
- Other coding agents such as T3 Code can use the same canonical recipes through verified mappings or adapters.
- Runtime-specific syntax stays at the edge. Shared behavior has one source of truth.

This is a future investigation, not a settled migration design.
