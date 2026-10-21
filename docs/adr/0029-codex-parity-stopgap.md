# Codex gets commands and rules through an opt-in stopgap

Until sync parity ([#2](https://github.com/kkacprzykdev/.agents/issues/2)), `ag sync` links no commands or rules into Codex. `sync/bin/codex-parity-sync.mjs` fills that gap on a machine that opts in. Nothing in `ag` runs it. `sync/bin/ag-codex-parity.mjs` runs `ag`, then the script after `ag sync`, `ag update`, `ag use`, and `ag skills add`. A machine opts in by linking that file as `ag` in a folder that comes before the real `ag` on `PATH`. A store that takes Core from this one gets both files and runs neither until it opts in.

The script reads the commands and rules from the links `ag sync` made in `~/.claude/commands/` and `~/.claude/rules/`, so it follows the Lineage without working it out again. It generates files into `sync/.generated/codex/`, which git ignores, and links them into `~/.codex/` the way `ag sync` links artifacts:

- **Rules:** Codex reads `~/.codex/AGENTS.override.md` in place of `~/.codex/AGENTS.md`. The generated override lists `~/.codex/AGENTS.md` and every rule file by path, and tells the agent to read each one before its first reply. Each text keeps one source.
- **Commands:** each command becomes the skill folder `cmd-<name>`, with `name: <name>` in its `SKILL.md`, so the user invokes it as `$<name>`. Codex reads the name from `SKILL.md`, not from the folder. `allow_implicit_invocation: false` in `agents/openai.yaml` lets only the user invoke it. The `SKILL.md` points at the command file.

On every run the script deletes all its own links and recreates them, the way `ag sync` does. `ag sync` removes the skill links and leaves the override alone, since it manages only `AGENTS.md` and `CLAUDE.md` in the agent home. `ag status` ignores links into `sync/.generated/`. When a command and a skill share a name, the script warns and links both, so Codex lists two skills with that name.

## Considered Options

- **Real copies in `~/.codex/`:** a real `AGENTS.md` there is a Blocker, so `ag sync` would stop for every coding agent. Real skill folders are Unmanaged artifacts on every sync, and one becomes a Blocker when a store skill takes its name.
- **The text of every rule inside the override:** the copies go stale whenever a rule changes. Paths keep one source, at the cost of the agent reading the files itself.
- **Running the script from `ag sync`:** every store that takes Core from this one would start writing into `~/.codex/`. The wrapper keeps it opt-in per machine.
- **Command folders without the prefix:** a command and a profile skill with the same name would need the same link in `~/.codex/skills/`.
