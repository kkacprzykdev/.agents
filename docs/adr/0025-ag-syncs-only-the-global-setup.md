# ag syncs only the Global setup

`ag` is built for one job: it keeps the Global setup in profiles and syncs it into every coding agent. It does not manage a project's own setup, and it does not try to cover every kind of agent configuration. Inside that scope the aim is completeness: every artifact kind it supports reaches every mapped coding agent. What each coding agent receives now is in [`../runtime-support.md`](../runtime-support.md).

Larger tools exist, such as skills-manager. They are prior art, listed in [`../prior-art.md`](../prior-art.md). A design decision checks how they solve the same problem first, then keeps only what fits this scope.

## Considered Options

- **Using skills-manager instead of `ag`:** it syncs only skills, and it has no profiles on git branches with a Lineage (ADR 0011, ADR 0017). Extending it would mean working inside a much larger tool with a different scope.
- **Managing project setups too:** a project's `.cursor/`, `.claude/`, `AGENTS.md`, and `CLAUDE.md` belong to that project's repository. Managing them would make `ag` much larger, for a problem the project's own repository already solves.
- **Building without checking prior art:** a decision could miss a solution that another tool already tested on many machines.
