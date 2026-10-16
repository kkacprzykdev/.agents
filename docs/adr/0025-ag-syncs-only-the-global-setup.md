# ag syncs only the Global setup

`ag` is built for one job: it keeps the Global setup in profiles and syncs it into every coding agent. It does not manage a project's own setup, and it does not try to cover every kind of agent configuration. Inside that scope the aim is completeness: every artifact kind it supports reaches every mapped coding agent. What each coding agent receives now is in [`../runtime-support.md`](../runtime-support.md).

Larger tools exist, such as skillshare and skills-manager. They are prior art, listed in [`../prior-art.md`](../prior-art.md). A design decision compares their answers with its other options and keeps only what fits this scope. Prior art informs a decision and never makes it (ADR 0027).

## Considered Options

- **Using an existing tool instead of `ag`:** skills-manager syncs only skills. skillshare syncs most artifact kinds, but it has one source per mode, with no profiles on git branches and no Lineage (ADR 0011, ADR 0017). Both also manage project setups. Extending either would mean working inside a much larger tool with a different scope.
- **Managing project setups too:** a project's `.cursor/`, `.claude/`, `AGENTS.md`, and `CLAUDE.md` belong to that project's repository. Managing them would make `ag` much larger, for a problem the project's own repository already solves.
