# Runtime support

## Current state

Every artifact kind reaches Cursor, Claude, and Codex. A profile keeps each artifact in the native format of the coding agent it came from. `ag sync` links the file wherever an agent reads it as it is, and links a Derived file in `sync/.generated/` where the agent needs other content (ADR 0033). A Derived file names its source. Edit that source, then run `ag sync`. `ag status` lists the Derived files that are out of date.

| Kind | Cursor | Claude | Codex |
|---|---|---|---|
| Skills | `~/.cursor/skills/` | `~/.claude/skills/` | `~/.codex/skills/`, and third-party skills from `~/.agents/skills/` |
| Commands | `~/.cursor/commands/` | `~/.claude/commands/` | `~/.codex/skills/cmd-<name>/`, invoked as `$<name>` |
| Rules | `~/.cursor/rules/` | `~/.claude/rules/`, as `.md` | by path, in `~/.codex/AGENTS.md` |
| Subagents | `~/.cursor/agents/` | `~/.claude/agents/` | `~/.codex/agents/`, as `.toml` |
| `AGENTS.md` | `~/.cursor/rules/AGENTS.mdc` | `~/.claude/AGENTS.md` | copied into `~/.codex/AGENTS.md` |
| `CLAUDE.md` | none | `~/.claude/CLAUDE.md` | none |

Adding a runtime mapping to `sync/runtimes.yaml` only declares where links go. It does not prove that the coding agent understands every artifact format or provides equivalent behavior.

### Verified versions

The adaptations below were checked in throwaway projects, with each agent's project-level folders, at these versions:

- Claude Code 2.1.310: a read-only subagent copy with `disallowedTools`.
- Cursor CLI 2026.10.22-27dcf5f: a Derived `.mdc` rule from a Claude rule, with `alwaysApply: true` and with `globs`, and a subagent listed once when it is in both `.cursor/agents/` and `.claude/agents/`.
- Codex CLI 0.164.0: the command skill's note for both numberings, and a Derived TOML subagent. Codex ran the subagent with its `developer_instructions`, but in the parent's sandbox: its `sandbox_mode = "read-only"` did not stop a write. With the sentence below at the start of its instructions, the same subagent refused the write.

## Portability notes

### Skills

A skill folder is linked as it is, except for who may invoke it. Cursor and Claude read `disable-model-invocation: true` in `SKILL.md`. Codex hides a skill from the model only through `policy.allow_implicit_invocation: false` in the skill's `agents/openai.yaml`, not through the `SKILL.md` key. `ag sync` reads that policy written as a block, or as a mapping on one line, such as `policy: {allow_implicit_invocation: false}`. It stops on a policy written any other way and names the file.

- **Both keys, or neither:** a link in every agent.
- **Only `disable-model-invocation: true`:** Codex gets a Derived folder. Codex skips a `SKILL.md` that is a link, so its `SKILL.md` keeps the original frontmatter and points at the original, like a command skill. It links every other file of the original and adds a Derived `agents/openai.yaml` with the policy. When the skill has its own `agents/openai.yaml`, the Derived one copies it and sets the policy.
- **Only the Codex policy:** Cursor and Claude get one shared Derived folder. Its `SKILL.md` keeps the original frontmatter with `disable-model-invocation: true` added, and points at the original. Claude replaces some text in a skill before the model reads it: `$ARGUMENTS`, `$0` and the other argument placeholders, `${CLAUDE_...}` variables, and `` !`command` `` output. A pointer would hide that text, so a skill that uses it gets a full copy instead. Every other file is linked.

Third-party skills in `skills/` are left alone. Codex lists `~/.agents/skills/` as the folder for user skills, so it reads them itself. The Codex mapping sets `reads-store-skills: true`, and `ag sync` links only store and profile skills into `~/.codex/skills/`. A link to a third-party skill there would show it twice.

### Commands

A command file is a Markdown file, in a profile's `commands-profile-me/` and in the store's `commands-store-me/` and `commands-core-me/`. Cursor and Claude get it as a command, and Claude Code still loads `~/.claude/commands/*.md`. Claude has merged commands into skills. A skill with the same name wins over a command.

Codex has no commands. Its custom prompts are deprecated in its docs, so `ag sync` does not use them. Each command becomes the Derived skill folder `~/.codex/skills/cmd-<name>/`:

- Its `SKILL.md` has `name: <name>`, so the user invokes it as `$<name>`. Codex takes the name from `SKILL.md`, not from the folder.
- It points at the command file, which the agent reads itself, so the text keeps one source.
- Its `agents/openai.yaml` sets `allow_implicit_invocation: false`, so only the user invokes it.
- A command and a skill with the same name both show in Codex.

Known differences:

- Claude reads the same frontmatter keys as skills, except `name` and `paths`. Without a `description`, it uses the first non-empty line of the body. So does the Codex command skill.
- Commands that name a Cursor tool, such as `AskQuestion`, should also allow "an equivalent structured prompt". Claude's tool is `AskUserQuestion`.
- A command that reads agent transcripts must find them for each runtime, because every runtime stores them in its own layout.

### Arguments

`$ARGUMENTS` is the text after the command name in all three agents. Positional placeholders differ: in Cursor `$1` is the first word, and in Claude `$0` is the first word and `$ARGUMENTS[N]` is the same as `$N`. Claude and Cursor replace placeholders before the model reads the command, so `ag sync` changes the numbering in a Derived copy. It reads the numbering from each file:

- **No `$<n>` or `$ARGUMENTS[N]`:** plain links in Cursor and Claude.
- **`$1`, `$2`, … and no `$0` or `$ARGUMENTS[N]`:** Cursor numbering. Claude gets a copy with every number lowered by one (`$1` → `$0`).
- **Any `$0` or `$ARGUMENTS[N]`:** Claude numbering. Cursor gets a copy with every number raised by one (`$0` → `$1`, `$ARGUMENTS[N]` → `$<N+1>`).
- **Codex** substitutes no placeholder, so the model reads them itself. The command skill says that the text after `$<name>` is `$ARGUMENTS`, and gives the file's numbering: "`$1` is the first word" or "`$0` is the first word".

Two pieces of advice for command authors:

- Where you can, name the input in prose, such as "the argument the user gave", rather than with a placeholder.
- Write `$0` when you mean Claude's numbering. A file with only `$1` reads as Cursor numbering.

### Rules

Rule files live in a profile's `rules-profile-me/` and in the store's `rules-store-me/` and `rules-core-me/`, in either format:

- **A Cursor `.mdc` rule:** a link in Cursor. Claude gets a Derived `x.md` with the whole file copied, frontmatter included. Claude follows a link in `~/.claude/rules/` and loads the file only when the file it points at ends in `.md`, so a link named `x.md` to `x.mdc` is skipped.
- **A Claude `.md` rule:** a link in Claude. Cursor ignores `.md` rules, so it gets a Derived `x.mdc` with the body copied. A rule with `paths` gets them as `globs` with `alwaysApply: false`. A rule without `paths` gets `alwaysApply: true`, because it loads on every run in Claude.
- **Codex** has no rules. Its Derived `~/.codex/AGENTS.md` lists every rule file by path, and tells the agent to read each one before its first reply. Each rule's `description`, `globs`, and `paths` arrive as written, and the agent judges from them whether the rule applies. Codex has no scope for global text, so every rule loads on every run there.

The same name in both formats in one Lineage is a Collision.

Known differences:

- Claude reads only the `paths` frontmatter key. It ignores and strips `description`, `alwaysApply`, and `globs`.
- A Cursor rule that relies on `globs` loads always in Claude. Add a matching `paths` key if a rule needs file-scoped loading in both, or write it as a Claude rule.
- Relative `@` imports resolve from the file Claude reads: the canonical file for a link, and `sync/.generated/claude/rules/` for a Derived copy of a Cursor rule. Rules should name files by absolute `~/.agents/...` paths instead.

Sources: [Claude Code skills and commands](https://code.claude.com/docs/en/skills), [Claude Code memory and rules](https://code.claude.com/docs/en/memory), and the [Claude Code changelog](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) (`.claude/rules/` since 2.0.64, commands merged into skills in 2.1.3).

### Subagents

A subagent is a Markdown file, the format of Cursor and Claude, or a Codex TOML file:

- **A Markdown subagent:** links in `~/.cursor/agents/` and `~/.claude/agents/`. Codex gets a Derived TOML with `name`, `description`, and the body copied into `developer_instructions`. `readonly: true` becomes `sandbox_mode = "read-only"`, and `model` is dropped, because a Cursor or Claude model name would break Codex. Codex 0.164.0 does not apply that `sandbox_mode`: a custom agent runs in the parent's sandbox. So the `developer_instructions` of a read-only subagent start with a sentence that tells it to change no file. That is an instruction, not a sandbox: a subagent in a session that may write can still write.
- **A read-only Markdown subagent:** Claude reads no `readonly` key. When the subagent sets `readonly: true` and neither `tools` nor `disallowedTools`, Claude gets a Derived copy that adds `disallowedTools: Write, Edit, NotebookEdit`. Claude's Bash tool stays available to it.
- **A Codex TOML subagent:** a link in `~/.codex/agents/`. Cursor and Claude get one shared Derived Markdown file built from `name`, `description`, and `developer_instructions`. `sandbox_mode = "read-only"` becomes both `readonly: true` and `disallowedTools: Write, Edit, NotebookEdit`, and each agent ignores the other's key.

Cursor reads `~/.claude/agents/` too, and lists a subagent that is in both folders once. One subagent name as `.md` and `.toml` in one Lineage is a Collision.

### Global instructions files

A profile keeps its `AGENTS.md` and `CLAUDE.md` in `artifacts/instructions-profile-me/`. That folder holds only these two files, and only one profile in a Lineage can have each one. A child profile that needs more global text uses a rule with `alwaysApply: true`, which reaches every agent.

- **`AGENTS.md`** holds the instructions for every coding agent.
  - Claude gets a link in `~/.claude/`.
  - Codex reads `~/.codex/AGENTS.md`, a Derived file: the text of `AGENTS.md`, then the path of every rule. `ag sync` makes no `AGENTS.override.md`, which Codex would read in place of `AGENTS.md`, so that file stays the user's. Codex stops reading instruction files at 32 KiB in all.
  - Cursor reads no global `AGENTS.md`. It gets the Derived rule `~/.cursor/rules/AGENTS.mdc`, with `alwaysApply: true` and a copy of the text. A copy, because Cursor reads a file named in a rule only when it thinks it needs it. A profile rule named `AGENTS` is a Collision.
- **`CLAUDE.md`** is Claude-only. A Root profile starts with an empty `AGENTS.md` and a `CLAUDE.md` that holds `@~/.claude/AGENTS.md`. The import uses the link in `~/.claude/`, because a relative import resolves next to the real `CLAUDE.md`, and the two files can sit in different profiles of a Lineage. Put lines for Claude only below the import. `ag sync` links `CLAUDE.md` only into Claude, and copies nothing from it into another agent. Claude reads `AGENTS.md` itself only in the working directory and above, and by default only when there is no `CLAUDE.md`, so the import stays the reliable path.

Claude keeps the skills of the user's account in `~/.claude/skills/synced/` and updates them itself. The Claude mapping lists that folder as `agent-owned`, so Sync never removes it, lists it, or links over it.

In the Agent home itself, clearing the target touches only the instruction file names that agent gets. Sync never removes or lists a real file there, such as `~/.claude/settings.json`. Its scan for old links removes only symlinks that point into the store's sources or into `sync/.generated/`, and that the current sync does not create.

Sources: [Codex skills](https://learn.chatgpt.com/docs/build-skills) and [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

A profile may record its own notes, such as how its artifacts behave in each coding agent, in its own docs.

## Desired future state

- Other coding agents such as T3 Code can use the same canonical recipes through verified mappings or adapters.
- Runtime-specific syntax stays at the edge. Shared behavior has one source of truth.

This is a future investigation, not a settled migration design.
