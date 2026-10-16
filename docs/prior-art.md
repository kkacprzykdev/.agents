# Prior art

Other tools already solve parts of what `ag` does. Before a design decision on sync, runtime mappings, or setup, check how these tools solve the same problem. Record what you took from them, or why you did not, in the issue or ADR of that decision.

They are prior art, not dependencies. `ag` stays a tool for the Global setup only (ADR 0025), so a solution that needs a larger scope is adapted or left out.

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
