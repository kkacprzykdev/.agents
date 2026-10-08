# Runtime-neutral agent store

The canonical store and its repository-wide rules are independent of one coding agent runtime. Core's runtime mappings in `sync/runtimes.yaml` map artifact kinds into each coding agent (ADR 0018). The current mappings are not the supported-agent boundary. Another compatible coding agent is added with a new mapping.

Runtime-specific paths, transcript layouts, or capabilities stay in clearly scoped mappings, locators, or artifacts. They do not become general store assumptions.

Runtime neutrality is a design constraint, not a claim of feature parity. A kind is mapped into a coding agent only after its format and behavior are verified there. What each coding agent receives, and the known gaps, are recorded in [`../runtime-support.md`](../runtime-support.md).
