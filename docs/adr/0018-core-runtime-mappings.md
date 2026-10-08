# Core owns the runtime mappings

`sync/runtimes.yaml` on `main` holds every runtime mapping: the agent home, the target folder for each artifact kind, and an optional link extension per kind. `ag` works out the sources for each kind from the Lineage (ADR 0017), so the mappings name no source paths. Every profile links into every mapping.

A fix to a mapping, or a new runtime, is made once on `main` and reaches every profile with `ag update`. In a store with an Upstream store, Core is read-only (ADR 0023), so such a change comes from the Upstream store.

## Considered Options

- **A full mapping file per profile:** every profile would repeat the same targets, and a fix would need copying to each profile. Source paths in the file would also have to change whenever the Lineage changes.
