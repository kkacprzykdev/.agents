# Prior art

Other tools already solve parts of what `ag` does. Before a design decision on sync, runtime mappings, or setup, check how these tools solve the same problem. Record what you took from them, or why you did not, in the issue or ADR of that decision.

## Prior art is not the source of truth

These tools show how others solved a similar problem. They are not the source of truth for `ag`, not a reference implementation, and not dependencies (ADR 0027).

- The options in the issue come first, including the ones the user proposed. Compare every option on its merits, against `ag`'s goals and ADRs.
- Add your own options too. Prior art adds options and evidence. It never removes one.
- Never choose an option only because a tool does it, and never reject one only because no tool does it.
- Name where each option came from: the issue, the agent, or a tool.
- `ag` has profiles on git branches, a Lineage, and the Global setup only (ADR 0011, ADR 0017, ADR 0025). A tool's answer often fits a different problem, so it is adapted or left out.
- How a coding agent behaves is settled by its official docs or by a test, not by a tool's code. Tools fall behind: two of them are out of date on Cursor's global rules (see [Global instructions for Cursor](#global-instructions-for-cursor)).

## How to use this doc

1. Find the problem in [Which tool to check](#which-tool-to-check).
2. Read the finding it links to. Findings were checked on 2026-10-16, at the versions named in each tool's section.
3. Open source files only when the finding does not answer the question. Read only the files the tool's "Where to look" table lists, through `gh api` or a shallow clone in a temporary folder.
4. Tools and coding agents change fast. Before you use a finding in a decision, check that the tool has no newer release, and check the official docs it cites.

## Which tool to check

| Problem | Finding | Check |
|---|---|---|
| Rules folded into one `AGENTS.md` for Codex | [Rules for Codex](#rules-for-codex) | rulesync, ruler, then skillshare |
| Global instructions for Cursor | [Global instructions for Cursor](#global-instructions-for-cursor) | skillshare, then rulesync |
| Commands as user-invoked Codex skills | [Commands for Codex](#commands-for-codex) | rulesync |
| `$ARGUMENTS` in each coding agent | [`$ARGUMENTS`](#arguments) | rulesync, then skillshare |
| Subagents, and the TOML format of Codex | [Subagents](#subagents) | skillshare, ruler, rulesync |
| Where generated files live, who owns them, cleanup | [Generated files](#generated-files) | skillshare, then rulesync |
| One canonical format, or translate at the edge | [Canonical format](#canonical-format) | rulesync, then skillshare |
| `AGENTS.md`, `CLAUDE.md`, and `@` imports | [Global instructions for Cursor](#global-instructions-for-cursor) | skillshare |
| Rules and commands in each coding agent | | skillshare |
| Finding the coding agents installed on a machine | | skillshare |
| Bringing existing files from an agent home into the store | | skillshare, then skills-manager |
| Finding duplicate skills | | skills-manager |
| Symlink or copy, and Windows | | skillshare, then skills-manager |
| Path of each coding agent's skills folder | | skills-manager, then skillshare |
| Hooks and MCP | | skillshare, then rulesync |

## Findings for sync parity (issue #2)

Each finding says what the coding agents' docs say, what each tool does, and how that compares with issue #2. A finding is evidence for the options in the issue, not a recommendation. A link to a source file points at the checked version.

### Rules for Codex

What Codex does ([AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)):

- In `~/.codex/`, Codex reads `AGENTS.override.md` if it exists, otherwise `AGENTS.md`. It uses only the first non-empty file. A generated `AGENTS.override.md` would hide the user's `AGENTS.md`.
- Codex stops adding instruction files once their combined size reaches `project_doc_max_bytes`, 32 KiB by default. It drops the rest without a warning. The docs do not say whether the global file counts toward this limit.
- The docs do not mention `@` imports. skillshare marks Codex as a coding agent that does not follow them, so an `@` line reaches the model as plain text.

What the tools do:

- **rulesync** folds every rule into the one `AGENTS.md`, because Codex has no rules folder. It writes only the body of each rule and drops its frontmatter, so `globs` do not reach Codex. The root rule goes first, then the other rules in source order, joined by one blank line. It warns when the project files pass 32 KiB. See [`codexcli-rule.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/codexcli-rule.ts), [`nested-agentsmd-rule.ts` L164-L173](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/nested-agentsmd-rule.ts#L164-L173), and the fold in [`rules-processor.ts` L2197-L2272](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/rules-processor.ts#L2197-L2272).
- **ruler** joins all its rule files into one text and puts `<!-- Source: <path> -->` before each one. `ruler revert` finds its own output by that marker. See [`RuleProcessor.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/RuleProcessor.ts).
- **skillshare** does not convert rules for Codex. Its `prepend` and `append` modes write the content of a source file into another file, between `<!-- skillshare:extra src="<path>" sha256=<hash> -->` and `<!-- /skillshare:extra -->`. One file can hold several blocks. The hash tells a hand edit from a source update, and sync stops instead of overwriting a block that was edited by hand. See [`extras_block.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extras_block.go).

Compared with issue #2: the issue keeps each rule's `globs` or `paths` in the Codex text, so the model can judge whether a rule applies. rulesync drops them. Both are options; rulesync's choice is not a reason to drop them.

### Global instructions for Cursor

What Cursor does:

- User Rules live in Cursor's settings (**Customize → Rules**) and sync with the Cursor account ([rules docs](https://cursor.com/docs/context/rules)).
- File-based user rules are also supported: "User rule files in `~/.cursor/rules` … stay on the machine and do not sync" ([rules help](https://cursor.com/help/customization/rules.md)). Only the help page says this. The docs page does not.
- A file mentioned with `@` in a rule is not inlined. The agent reads it with its tools when it needs it. "Put anything that must always be in context directly in the rule body."
- Cursor reads `AGENTS.md` in a project root and its subfolders, not globally.

What the tools do:

- **skillshare** and **rulesync** both treat Cursor as having no global rules file. skillshare leaves Cursor out of shared instructions because "its user rules live in Cursor's settings" ([sharing-instructions.md](https://github.com/runkids/skillshare/blob/v0.25.13/website/docs/how-to/daily-tasks/sharing-instructions.md)). rulesync marks Cursor rules as project only ([`rules-processor.ts` L809-L819](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/rules-processor.ts#L809-L819)). Both disagree with the Cursor help page. `ag` already links rules into `~/.cursor/rules/`, so confirm in a real Cursor that a rule there loads before building on it.
- No tool makes a Cursor rule from a global `AGENTS.md`. **ruler** writes a project `AGENTS.md` for Cursor ([`CursorAgent.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/agents/CursorAgent.ts)), which does not apply at global scope.
- **skillshare** knows which instruction file each coding agent reads, in which order, and whether it follows `@` imports. Claude does. Codex and Cursor do not. The table is in [sharing-instructions.md](https://github.com/runkids/skillshare/blob/v0.25.13/website/docs/how-to/daily-tasks/sharing-instructions.md), and the data in [`internal/config/targets.yaml`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/config/targets.yaml).
- **skillshare** moves `CLAUDE.md` text into an `AGENTS.md` and keeps a managed block of `@` lines in `CLAUDE.md`: `<!-- skillshare:instructions:begin -->` … `<!-- skillshare:instructions:end -->`. Claude strips block-level HTML comments, so the markers cost no context. See [`internal/instructions/convert.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/instructions/convert.go) and [`extras_file.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extras_file.go).

Compared with issue #2: the issue leaves open how the generated rule gets the instructions to Cursor, and asks the grilling session for options. The prior art adds these, next to the issue's own and any the agent proposes: copy the whole text into the rule (rulesync, ruler); a managed block with a source path and hash (skillshare `prepend`); or an `@` line, which Cursor does not inline.

### Commands for Codex

What the coding agents do:

- **Codex** has no custom prompts, its form of commands, since `rust-v0.118.0` ([openai/codex#16115](https://github.com/openai/codex/pull/16115)). Its [custom prompts page](https://learn.chatgpt.com/docs/custom-prompts) still calls them "deprecated".
- **Codex** skills: `policy.allow_implicit_invocation: false` in `agents/openai.yaml` stops implicit use, and "explicit `$skill` invocation still works". The user skills folder is `$HOME/.agents/skills`, and Codex follows symlinked skill folders ([skills docs](https://learn.chatgpt.com/docs/build-skills)).
- **Cursor** turns commands into skills itself. Its `/migrate-to-skills` converts user and workspace commands "to skills with `disable-model-invocation: true`" ([skills docs](https://cursor.com/docs/skills.md)). Cursor's docs have no page for commands.
- **Claude** merged commands into skills. `disable-model-invocation: true` makes a skill run only through `/name` ([skills docs](https://code.claude.com/docs/en/skills)).

What the tools do:

- **rulesync** maps a skill's `disable-model-invocation: true` to a generated `agents/openai.yaml` with `policy.allow_implicit_invocation: false`. An explicit `codexcli.policy` value wins. See [`codexcli-skill.ts` L53-L100](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/skills/codexcli-skill.ts#L53-L100).
- **rulesync** turns each command into a generated `<slug>/SKILL.md` folder for coding agents that have no commands (Devin, Hermes Agent). The slug is the file name without `.md`, with every character outside `a-zA-Z0-9_-` replaced by `-`. A folder that matches a command is owned by the commands feature, so the skills cleanup neither imports nor deletes it. See [`command-skill-ownership.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/commands/command-skill-ownership.ts) and [`devin-command.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/commands/devin-command.ts).
- **rulesync** writes Codex commands to `~/.codex/prompts/` ([`codexcli-command.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/commands/codexcli-command.ts)). Codex does not read them.
- **skillshare** does not turn commands into skills. Its `gemini-commands` extension shows a command converted to another format at sync time ([`extensions/`](https://github.com/runkids/skillshare/tree/v0.25.13/extensions)).

Compared with issue #2: the issue proposes linking each command into Codex as a skill, and a mechanism that adds the missing invocation configuration to the original command. Cursor and Claude both move commands to user-invoked skills, which matches the long-term idea in `docs/runtime-support.md`. Then a command stored as a skill with `disable-model-invocation: true` would need only a generated `agents/openai.yaml` for Codex. Weigh both against the open question in the issue about how a command file becomes a skill folder.

### `$ARGUMENTS`

- **Claude** replaces `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, and named arguments. When no placeholder receives the input, it appends `ARGUMENTS: <input>` to the skill ([skills docs](https://code.claude.com/docs/en/skills)).
- **Cursor** docs say nothing about arguments for skills or commands. rulesync passes `$ARGUMENTS` to Cursor unchanged, as literal text.
- **Codex** skills docs say nothing about arguments. rulesync notes that Codex passes placeholders to the model as literal text ([command-syntax.md](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/reference/command-syntax.md)).
- **rulesync** rewrites `$ARGUMENTS` per coding agent, for example to `{{args}}` for Tabnine and `$prompt` for Junie. **skillshare**'s `gemini-commands` extension replaces `$ARGUMENTS` and `$1` with `{{args}}`.

Not verified: what the model does with a literal `$ARGUMENTS` in Cursor and Codex. Test it in both before deciding.

### Subagents

What the coding agents read:

| | Claude | Cursor | Codex |
|---|---|---|---|
| User folder | `~/.claude/agents/`, recursive | `~/.cursor/agents/`, plus `~/.claude/agents/` and `~/.codex/agents/` | `~/.codex/agents/` |
| Format | Markdown, YAML frontmatter | Markdown, YAML frontmatter | TOML |
| Required | `name`, `description` | nothing | `name`, `description`, `developer_instructions` |
| Model | `sonnet`, `opus`, `haiku`, `fable`, full ID, or `inherit` | `inherit` by default | `model`, `model_reasoning_effort`, and others |
| Unknown keys | ignored without an error | not stated | not stated |

Sources: [Claude subagents](https://code.claude.com/docs/en/sub-agents), [Cursor subagents](https://cursor.com/docs/context/subagents), [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

What follows from the docs:

- Cursor reads `~/.claude/agents/`, so a subagent linked there and in `~/.cursor/agents/` reaches Cursor twice. On a name conflict `.cursor/` wins, so Cursor shows it once.
- Codex docs name no field that points a subagent at a separate instruction file. `developer_instructions` is the only documented instruction field, inline. `model_instructions_file` exists in `config.toml`, but it replaces Codex's base instructions and is not documented for subagent files. So the TOML must hold the text, unless a test in Codex shows otherwise.
- A Codex subagent file cannot override `sandbox_mode`, `approval_policy`, `model_provider`, or `mcp_servers`. It inherits them from the parent.

What the tools do:

- **skillshare** `codex-agents` writes `name` (or the file name), `description`, and `model`, and puts the Markdown body in `developer_instructions`. It drops other keys and stops with an error when a required value is empty. It passes `model` through unchanged, so a Claude alias such as `sonnet` would reach Codex. See [`extensions/codex-agents/convert.js`](https://github.com/runkids/skillshare/blob/v0.25.13/extensions/codex-agents/convert.js).
- **ruler** drops `model: inherit`, passes other models through, and maps `readonly: true` to `sandbox_mode = "read-only"`. Codex docs say a subagent file cannot override `sandbox_mode`, so that mapping may do nothing. See [`SubagentsProcessor.ts` L270-L286](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/SubagentsProcessor.ts#L270-L286).
- **rulesync** keeps fields only Codex knows in a `codexcli:` section of the canonical subagent, and drops `short-description`, which Codex rejects. See [`codexcli-subagent.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/subagents/codexcli-subagent.ts).

### Generated files

- **skillshare** writes generated files straight into the agent folder, as copies. It lists them in `.skillshare-manifest.json` in that folder, and orphan cleanup removes only copies it wrote that nobody edited. Shared instruction files live in its own source folder, `~/.config/skillshare/extras/<name>/AGENTS.md`. It keeps the last 10 versions of each file it changes in `~/.local/state/skillshare/extras/backups/`. See [`manifest.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/manifest.go) and [`extras.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extras.go).
- **skillshare** has an ownership rule for one target file: a link or a copy owns the whole file, and only `import`, `prepend`, and `append` can share it with other sources. It checks this before it writes anything. Compare it with the Collision of ADR 0017. See [`extras_connections.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/config/extras_connections.go).
- **rulesync** writes generated files straight into each agent home, with no folder in between. It follows symlinks in its sources and copies their content into the output. With `delete: true` it removes every skill folder in a target that it did not generate, even ones from other installers. It never removes symlinks or hidden entries. See [global-mode.md](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/guide/global-mode.md).
- **ruler** writes straight into the target, keeps `.bak` backups, and finds its own output by the `<!-- Source: -->` markers on revert ([`revert-engine.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/revert-engine.ts)).

Compared with issue #2: no tool keeps generated files in a folder of their own and links them into the agents, as the issue proposes. skillshare's shared-file source folder is the nearest match. That no tool does it is not a reason against it.

### Canonical format

- **rulesync** has its own canonical format for every kind: `.rulesync/rules/`, `commands/`, `subagents/`, and `skills/`. Shared fields sit at the top of the frontmatter, and each coding agent has its own section, such as `cursor:`, `claudecode:`, and `codexcli:`, that overrides them. It has one adapter per coding agent per kind, `src/features/<kind>/<agent>-<kind>.ts`, and it can import any agent's files back into the canonical format. See [file-formats.md](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/reference/file-formats.md).
- **ruler** uses plain Markdown for rules and Claude- or Cursor-style frontmatter for subagents, with one adapter per coding agent ([`src/agents/`](https://github.com/intellectronica/ruler/tree/v0.3.44/src/agents)).
- **skillshare** has no canonical format. It passes files through unchanged and leaves translation to extensions at the edge. For a file that one coding agent cannot read, it suggests a second copy limited to that agent with `targets:` ([agents.md](https://github.com/runkids/skillshare/blob/v0.25.13/website/docs/understand/agents.md)).

## skillshare

[runkids/skillshare](https://github.com/runkids/skillshare), MIT license, written in Go. Checked at v0.25.13.

A CLI, with a separate desktop app, that syncs one source into many coding agents. It has a global mode and a project mode.

What it covers, from its README and source tree:

- **Artifact kinds:** skills, subagents, rules and commands, instruction files, MCP connections, hooks, and plugins. Rules and commands are "extras": folders of files that sync into the folder each coding agent reads.
- **Extras modes:** `merge`, `symlink`, and `copy` for folders. A single-file extra can also use `import` (an `@` line in a managed block), `prepend`, or `append` (the file's content in a managed block).
- **Extensions:** a script that converts each file during sync, for example Markdown to TOML. It reads the file on stdin and writes the output on stdout. A target with an extension always gets copies.
- **Subagents:** the `codex-agents` extension converts a Markdown subagent into a Codex TOML file. It writes the Markdown body into `developer_instructions`, so the TOML file holds the text itself.
- **Instruction files:** it knows which instruction files and rules folders each coding agent reads, and in which order. It can move the text of a `CLAUDE.md` into an `AGENTS.md` and keep the `@` import lines in the `CLAUDE.md`.
- **Sync:** symlinks on macOS and Linux. On Windows, junctions for folders, and file symlinks with Developer Mode, otherwise copies. Each target can switch to copies.
- **Existing files:** `skillshare init` detects installed coding agents. `collect` copies files from a coding agent's folders back into the source.
- **No profiles:** it has one source per mode, not profiles on git branches.

Where to look:

| Problem | Files |
|---|---|
| Rules and commands (extras) | [`internal/sync/extras*.go`](https://github.com/runkids/skillshare/tree/v0.25.13/internal/sync), [`cmd/skillshare/extras*.go`](https://github.com/runkids/skillshare/tree/v0.25.13/cmd/skillshare), [`ai_docs/tests/extras_commands_runbook.md`](https://github.com/runkids/skillshare/blob/v0.25.13/ai_docs/tests/extras_commands_runbook.md) |
| Managed blocks in a shared file (`prepend`, `append`) | [`internal/sync/extras_block.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extras_block.go) |
| Single-file extras and the `@` import block | [`internal/sync/extras_file.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extras_file.go), [`internal/config/extras_connections.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/config/extras_connections.go) |
| Extensions that convert files | [`extensions/README.md`](https://github.com/runkids/skillshare/blob/v0.25.13/extensions/README.md), [`internal/sync/extension.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extension.go) |
| Subagents and Codex TOML | [`extensions/codex-agents/`](https://github.com/runkids/skillshare/tree/v0.25.13/extensions/codex-agents), [`internal/sync/agent_sync.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/agent_sync.go), [`internal/resource/agent.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/resource/agent.go), [`website/docs/understand/agents.md`](https://github.com/runkids/skillshare/blob/v0.25.13/website/docs/understand/agents.md) |
| Instruction files and `CLAUDE.md` to `AGENTS.md` | [`internal/instructions/`](https://github.com/runkids/skillshare/tree/v0.25.13/internal/instructions), [`website/docs/how-to/daily-tasks/sharing-instructions.md`](https://github.com/runkids/skillshare/blob/v0.25.13/website/docs/how-to/daily-tasks/sharing-instructions.md) |
| Paths each coding agent reads | [`internal/config/targets.yaml`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/config/targets.yaml) |
| Copies it wrote, and cleanup | [`internal/sync/manifest.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/manifest.go), [`internal/sync/extras.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/extras.go) |
| Detecting coding agents, first setup | [`cmd/skillshare/init_detect.go`](https://github.com/runkids/skillshare/blob/v0.25.13/cmd/skillshare/init_detect.go), [`cmd/skillshare/init_flow.go`](https://github.com/runkids/skillshare/blob/v0.25.13/cmd/skillshare/init_flow.go), [`internal/config/targets.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/config/targets.go) |
| Bringing files back from coding agents | [`cmd/skillshare/collect*.go`](https://github.com/runkids/skillshare/tree/v0.25.13/cmd/skillshare) |
| Symlinks, copies, and Windows | [`internal/sync/symlink_unix.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/symlink_unix.go), [`internal/sync/symlink_windows.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/symlink_windows.go), [`internal/sync/copy.go`](https://github.com/runkids/skillshare/blob/v0.25.13/internal/sync/copy.go) |
| MCP | [`internal/mcp/`](https://github.com/runkids/skillshare/tree/v0.25.13/internal/mcp) |
| Hooks | [`internal/hooks/`](https://github.com/runkids/skillshare/tree/v0.25.13/internal/hooks) |

## rulesync

[dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync), MIT license, written in TypeScript. Checked at v36.0.2.

A CLI that generates the files of many coding agents from one canonical source. It has a project mode and a global mode (`--global`), which writes into the agent homes.

What it covers, from its docs and source tree:

- **Artifact kinds:** rules, commands, subagents, skills, ignore files, MCP, hooks, and permissions. It does not do profiles.
- **Generation, not links:** it writes every output as a file, in the format of each coding agent. It follows symlinks in its sources and copies their content.
- **Canonical format:** shared frontmatter fields plus one section per coding agent. It imports any agent's files back into the canonical format.
- **Rules:** for a coding agent without a rules folder, such as Codex, it folds all rules into the one instruction file.
- **Commands:** it rewrites `$ARGUMENTS` per coding agent. For coding agents without commands, it can turn each command into a skill folder.
- **Coverage per agent:** a table marks which kinds each coding agent supports, and which of those work in global mode.

Where to look:

| Problem | Files |
|---|---|
| Kinds per coding agent, and global support | [`docs/reference/supported-tools.md`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/reference/supported-tools.md) |
| Canonical format of each kind | [`docs/reference/file-formats.md`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/reference/file-formats.md) |
| Global mode and cleanup in shared folders | [`docs/guide/global-mode.md`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/guide/global-mode.md) |
| Rules folded into one `AGENTS.md` | [`src/features/rules/rules-processor.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/rules-processor.ts), [`src/features/rules/nested-agentsmd-rule.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/nested-agentsmd-rule.ts), [`src/features/rules/codexcli-rule.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/codexcli-rule.ts) |
| Cursor and Claude rule frontmatter | [`src/features/rules/cursor-rule.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/cursor-rule.ts), [`src/features/rules/claudecode-rule.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/rules/claudecode-rule.ts) |
| Codex skills and `agents/openai.yaml` | [`src/features/skills/codexcli-skill.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/skills/codexcli-skill.ts) |
| Commands turned into skill folders | [`src/features/commands/command-skill-ownership.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/commands/command-skill-ownership.ts), [`src/features/commands/devin-command.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/commands/devin-command.ts) |
| `$ARGUMENTS` per coding agent | [`docs/reference/command-syntax.md`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/docs/reference/command-syntax.md) |
| Subagents and Codex TOML | [`src/features/subagents/codexcli-subagent.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/subagents/codexcli-subagent.ts), [`src/features/subagents/cursor-subagent.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/subagents/cursor-subagent.ts), [`src/features/subagents/claudecode-subagent.ts`](https://github.com/dyoshikawa/rulesync/blob/v36.0.2/src/features/subagents/claudecode-subagent.ts) |
| Paths of each coding agent | [`src/constants/`](https://github.com/dyoshikawa/rulesync/tree/v36.0.2/src/constants) |

## ruler

[intellectronica/ruler](https://github.com/intellectronica/ruler), MIT license, written in TypeScript. Checked at v0.3.44.

A CLI that joins one folder of rules into the instruction file of each coding agent. It is built for projects. A global config in `~/.config/ruler` is used only when a project has no `.ruler/` folder, and the output still goes into the project.

What it covers, from its README and source tree:

- **Artifact kinds:** rules, MCP, skills, and subagents (experimental, off by default). No commands.
- **Rules:** all rule files are joined into one text, with a `<!-- Source: <path> -->` line before each.
- **Subagents:** one Markdown source per subagent, written as Markdown for Claude and Cursor and as TOML for Codex.
- **Revert:** `ruler revert` restores `.bak` backups or removes the files it generated.

Where to look:

| Problem | Files |
|---|---|
| Joining rules into one file | [`src/core/RuleProcessor.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/RuleProcessor.ts) |
| Subagents for Claude, Cursor, and Codex | [`src/core/SubagentsProcessor.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/SubagentsProcessor.ts), [README, Subagents Support](https://github.com/intellectronica/ruler/blob/v0.3.44/README.md#subagents-support-experimental) |
| One adapter per coding agent | [`src/agents/`](https://github.com/intellectronica/ruler/tree/v0.3.44/src/agents) |
| Backups and revert of generated files | [`src/core/revert-engine.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/revert-engine.ts), [`src/core/FileSystemUtils.ts`](https://github.com/intellectronica/ruler/blob/v0.3.44/src/core/FileSystemUtils.ts) |

## skills-manager

[xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager), MIT license. Checked at v1.42.0.

A desktop app with a CLI that manages skills for 54 coding agents, Cursor, Claude Code, and Codex among them. A Rust core serves both. The CLI has a `--json` mode for agents.

What it covers, from its README and source tree:

- **Artifact kinds:** skills only. Rules, commands, subagents, and Global instructions files are not covered.
- **Scopes:** each coding agent's global skills folder, project skill folders, and any folder linked as a skills root.
- **Sync:** a symlink or a copy into each coding agent. A Windows app copies into WSL, because it cannot create links there.
- **Existing skills:** it lists skills in a global folder that it did not install, and `skills adopt` brings them under its management.
- **Backup and machines:** a git repository, private on GitHub by default. Merges are per skill, not per line. On a conflict it keeps the local version until the user chooses.
- **Coding agent paths:** one adapter per coding agent, and a user can add a coding agent or change its skills folder.

Where to look:

| Problem | Files |
|---|---|
| Path and behavior of each coding agent | [`src-tauri/src/core/tool_adapters.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/tool_adapters.rs), [`src-tauri/src/core/well_known.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/well_known.rs) |
| Symlink or copy, Windows and WSL | [`src-tauri/src/core/sync_engine.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/sync_engine.rs), [`src-tauri/src/core/sync_metadata.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/sync_metadata.rs) |
| Finding and adopting skills that already exist | [`src-tauri/src/core/scanner.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/scanner.rs), [`src-tauri/src/commands/scan.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/commands/scan.rs) |
| Finding duplicates by content | [`src-tauri/src/core/content_hash.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/content_hash.rs) |
| Per-skill merge and conflicts | [`src-tauri/src/core/merge/`](https://github.com/xingkongliang/skills-manager/tree/v1.42.0/src-tauri/src/core/merge), [`src-tauri/src/core/git_backup.rs`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/src-tauri/src/core/git_backup.rs) |
| Skill formats it accepts | [`docs/skill-format-detection-spec.md`](https://github.com/xingkongliang/skills-manager/blob/v1.42.0/docs/skill-format-detection-spec.md) |
