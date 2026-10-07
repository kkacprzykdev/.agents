# Location decides who owns an artifact

Where a file lives says which branch owns it:

- `profiles/<name>` and everything in it: the branch `<name>`. Every profile below it in a Lineage links its artifacts. Other files directly in `profiles/`, such as `.env.active`, belong to the Active profile.
- `skills/` and `.skill-lock.json`: a third-party skills installer. A skill belongs to the highest branch in the Active profile's Lineage that contains it. A new skill, and the lock file, belong to the Active profile. A profile may still change an inherited skill on its own branch, for a change only it needs.
- Everything else, including `artifacts/<kind>-store-me/`: Core, on `main`. Store artifacts are about editing `~/.agents`, documenting it, or running `ag`. Every profile links them.

`ag owner <path>` applies these rules and names the checkout to edit: `~/.agents` when it holds the owning branch, the Edit worktree for any other. It reads the Active profile only for paths whose owner depends on it, so it answers `main` for Core paths even on a clone with no Active profile.

Artifacts carry no visibility marker. Which profiles may be pushed is decided by push protection (ADR 0015), not by the artifact.

## Considered Options

- **A visibility marker on each artifact:** once every private artifact lives in its own profile, a marker on a shared artifact could only ever say "publishable". A marker that cannot vary is noise, and keeping it in sync with gitignore is error-prone.
- **Store artifacts inside a profile:** they would work the same way, but store maintenance would be mixed with that profile's workflow, and a profile created from `main` would lack them.
- **Repo-local files for store artifacts (`AGENTS.md`, `.cursor/rules/`):** runtimes load them only when the store is an open workspace folder. Agents that edit the store from another workspace would miss them. A root `AGENTS.md` also applies to every folder of a multi-root Cursor workspace.
