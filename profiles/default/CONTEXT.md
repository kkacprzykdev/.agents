# The `default` profile

The general workflow on top of Core: references, machine-local setup, and where generated artifacts go. It uses every term in the Core glossary ([`../../CONTEXT.md`](../../CONTEXT.md)) and adds its own.

## Language

### Profiles

**Default profile**:
The profile named `default`, a Root profile. Its Lineage holds the references mechanism, the Profile setup, and the Output map.
_Avoid_: Base profile, the Core branch

**Work profile**:
The profile named `work`, created from `default`. It holds workplace artifacts and references, and is protected.
_Avoid_: Private profile, work overlay

### References

**Reference**:
A profile file under `references/` that holds environment-specific values for artifacts, such as URLs, templates, vault paths, or product hosts.
_Avoid_: Config, settings, values beside the artifact

**Shared reference**:
`references/shared.md`. Values that several artifacts read.
_Avoid_: Global reference, common config

**Named reference**:
`references/<artifact>.md`. Values that one artifact reads.
_Avoid_: Artifact config, per-skill settings

**Reference fallback**:
How a reference resolves: the Active profile's file, then each ancestor's file up to `default`, then the artifact's generic behavior. The first file found wins as a whole.
_Avoid_: Merging references, default override

**References rule**:
The always-on rule `profile-references.mdc`. It tells agents how to resolve the Active profile, the Output map, the Profile setup, and references.
_Avoid_: Load protocol, profile loader

### Machine-local setup

**Profile setup**:
The profile's `.env`, a local file of `KEY=value` lines: machine-local paths such as the home directory and tool clones. Template: `profiles/default/.env.example`. It is not a reference.
_Avoid_: Env, secrets, machine config

**Output map**:
The profile's `.env.outputs`, a local file of `kind=directory` lines. It says where agents write each kind of Generated artifact. Template: `profiles/default/.env.outputs.example`.
_Avoid_: Output config, vault map

**Fallback directory**:
The Output map's mandatory `fallback` directory. Every kind without its own line uses it.
_Avoid_: Default directory

**Vault**:
The folder tree where generated artifacts live, outside `~/.agents`.
_Avoid_: Notes folder, scratch

**Generated artifact**:
A file an agent writes for later reading, such as a chat context summary, a work state, or an analysis package. Its kind picks its directory in the Output map.
_Avoid_: Output, report, note

## Relationships

- **Profile setup and Output map → Local files**: both are local files listed in `profile.yaml`. `ag new --from default` copies them. `setup-default` confirms them.
- **References → Lineage**: Reference fallback follows the Core Lineage, but stops at `default`, because Core has no references.
