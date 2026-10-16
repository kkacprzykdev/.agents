# Prior art

Other tools already solve parts of what `ag` does. Before a design decision on sync, runtime mappings, or setup, check how these tools solve the same problem. Record what you took from them, or why you did not, in the issue or ADR of that decision.

They are prior art, not dependencies. `ag` stays a tool for the Global setup only (ADR 0025), so a solution that needs a larger scope is adapted or left out.

## Which tool to check

| Problem | Check |
|---|---|
| Rules and commands in each coding agent | skillshare |
| Subagents, and the TOML format of Codex | skillshare |
| `AGENTS.md`, `CLAUDE.md`, and `@` imports | skillshare |
| Finding the coding agents installed on a machine | skillshare |
| Bringing existing files from an agent home into the store | skillshare, then skills-manager |
| Finding duplicate skills | skills-manager |
| Symlink or copy, and Windows | skillshare, then skills-manager |
| Path of each coding agent's skills folder | skills-manager, then skillshare |
| Hooks and MCP | skillshare |

## skillshare

[runkids/skillshare](https://github.com/runkids/skillshare), MIT license, written in Go. Checked at v0.25.13.

A CLI, with a separate desktop app, that syncs one source into many coding agents. It has a global mode and a project mode.

What it covers, from its README and source tree:

- **Artifact kinds:** skills, subagents, rules and commands, instruction files, MCP connections, hooks, and plugins. Rules and commands are "extras": folders of files that sync into the folder each coding agent reads.
- **Subagents:** an extension converts a Markdown subagent into a Codex TOML file. It writes the Markdown body into `developer_instructions`, so the TOML file holds the text itself.
- **Instruction files:** it knows which instruction files and rules folders each coding agent reads, and in which order. It can move the text of a `CLAUDE.md` into an `AGENTS.md` and keep the `@` import lines in the `CLAUDE.md`.
- **Sync:** symlinks on macOS and Linux. On Windows, junctions for folders, and file symlinks with Developer Mode, otherwise copies. Each target can switch to copies.
- **Existing files:** `skillshare init` detects installed coding agents. `collect` copies files from a coding agent's folders back into the source.
- **No profiles:** it has one source per mode, not profiles on git branches.

Where to look:

| Problem | Files |
|---|---|
| Rules and commands (extras) | `internal/sync/extras*.go`, `cmd/skillshare/extras*.go`, `ai_docs/tests/extras_commands_runbook.md` |
| Subagents and Codex TOML | `extensions/codex-agents/`, `internal/sync/agent_sync.go`, `internal/resource/agent.go` |
| Instruction files and `CLAUDE.md` to `AGENTS.md` | `internal/instructions/` |
| Detecting coding agents, first setup | `cmd/skillshare/init_detect.go`, `cmd/skillshare/init_flow.go`, `internal/config/targets.go` |
| Bringing files back from coding agents | `cmd/skillshare/collect*.go` |
| Symlinks, copies, and Windows | `internal/sync/symlink_unix.go`, `internal/sync/symlink_windows.go`, `internal/sync/copy.go` |
| MCP | `internal/mcp/` |
| Hooks | `internal/hooks/` |

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
| Path and behavior of each coding agent | `src-tauri/src/core/tool_adapters.rs`, `src-tauri/src/core/well_known.rs` |
| Symlink or copy, Windows and WSL | `src-tauri/src/core/sync_engine.rs`, `src-tauri/src/core/sync_metadata.rs` |
| Finding and adopting skills that already exist | `src-tauri/src/core/scanner.rs`, `src-tauri/src/commands/scan.rs` |
| Finding duplicates by content | `src-tauri/src/core/content_hash.rs` |
| Per-skill merge and conflicts | `src-tauri/src/core/merge/`, `src-tauri/src/core/git_backup.rs` |
| Skill formats it accepts | `docs/skill-format-detection-spec.md` |
