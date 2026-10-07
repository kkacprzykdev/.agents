# Context Map

## Contexts

- [Agent store](./CONTEXT.md): Core, Upstream store, profiles, Lineage, Profile branches, artifacts
- [Agent setup](./sync/CONTEXT.md): canonical store, Edit worktree, sync, update, runtime mappings, the `-me` suffix
- A profile's own glossary lives at `profiles/<name>/CONTEXT.md` on its branch, when the profile has one.

## Relationships

- **Agent store → Agent setup**: Profiles live in the canonical store. The Active profile's Lineage decides which artifact directories sync links. Its `profile.yaml` decides which runtime mappings apply.
- **Agent setup → Agent store**: The `-me` suffix marks who authored an artifact. Where the artifact directory lives marks who owns it: a profile, Core, or a third-party installer.
- **Agent store → a profile's glossary**: A profile's glossary uses the Core terms and adds its own. It never redefines a Core term.
