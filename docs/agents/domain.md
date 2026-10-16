# Domain Docs

How the engineering skills should consume this store's domain documentation when exploring it.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root. It points at one `CONTEXT.md` per context:
  - `CONTEXT.md`: Agent store (Core, profiles, Lineage, artifacts)
  - `sync/CONTEXT.md`: Agent setup (sync, update, runtime mappings)
  - `profiles/<name>/CONTEXT.md`: a profile's own glossary, on its branch

  Read each one relevant to the topic.
- **`docs/adr/`**: Core decisions. **`profiles/<name>/docs/adr/`**: one profile's decisions. Read the ADRs that touch the area you're about to work in.
- **`docs/prior-art.md`**: other tools that solve parts of the same problem. Before a design decision on sync, runtime mappings, or setup, check how they solve it. Prior art is one input, not the source of truth (ADR 0027). Weigh the options in the issue, including the user's own, and your own options on their merits. Never choose an option only because a tool does it, and name where each option came from.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

How to write these docs (current state only, ADRs without status) is in the `store-docs.mdc` rule.

## File structure

```
/
├── CONTEXT-MAP.md
├── CONTEXT.md                 ← Agent store
├── docs/adr/                  ← Core decisions
├── sync/CONTEXT.md            ← Agent setup
└── profiles/<name>/
    ├── CONTEXT.md             ← profile glossary
    └── docs/adr/              ← profile decisions
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
