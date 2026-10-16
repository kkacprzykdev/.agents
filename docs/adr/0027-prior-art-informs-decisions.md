# Prior art informs decisions, it does not make them

Prior art is other tools that solve parts of the same problem, listed in [`../prior-art.md`](../prior-art.md). It shows how someone else solved a problem. It is not the source of truth for `ag`, and it is not a reference implementation to copy.

A design decision weighs every option on its own merits, against `ag`'s goals and ADRs:

- The options in the issue come first, including the ones the user proposed. Each one stays on the table until it is compared with the others.
- The agent in a design session adds its own options too.
- Prior art adds options and evidence: what a tool does, and what went wrong for it. It never removes an option.
- A tool doing something is not a reason to choose it. A tool not doing something is not a reason to reject it. `ag` has profiles on git branches, a Lineage, and the Global setup only (ADR 0011, ADR 0017, ADR 0025), so a tool's answer often fits a different problem.
- Each option names where it came from: the issue, the agent, or a tool.

Facts about how a coding agent behaves come from its official docs, or from a test in that coding agent. A tool's code is not proof, because tools fall behind the coding agents they support.

## Considered Options

- **Following the most complete tool:** a decision would inherit that tool's scope and its mistakes, and options the user proposed would lose without being compared.
- **Ignoring prior art:** a decision could miss a solution, or a failure, that another tool already found on many machines.
