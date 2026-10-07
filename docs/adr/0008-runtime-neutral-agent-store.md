# Runtime-neutral agent store

The canonical store and its repository-wide rules are independent of one coding agent runtime. Core's runtime mappings in `sync/runtimes.yaml` map artifact kinds into each runtime (ADR 0018). Cursor and Claude are current mappings, not the supported-agent boundary. Compatible runtimes such as Codex or T3 Code can be added with new mappings.

Runtime-specific paths, transcript layouts, or capabilities stay in clearly scoped mappings, locators, or artifacts. They do not become general store assumptions.

Runtime neutrality is a design constraint, not a claim of feature parity. A runtime is fully supported only after every mapped artifact kind is verified there. Coverage and known gaps are recorded in [`../runtime-support.md`](../runtime-support.md).
