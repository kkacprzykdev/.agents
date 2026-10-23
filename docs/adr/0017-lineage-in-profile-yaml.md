# The Lineage is declared in profile.yaml

Each profile has a committed `profiles/<name>/profile.yaml`:

```yaml
parent: default
local-files: [.env, .env.outputs]
migration-level: 2
```

- `parent` names the one Parent profile, or `main` for a Root profile. `ag` follows it to build the Lineage, at any depth.
- `local-files` lists the profile's files that are never committed, relative to its folder.
- `migration-level` is the layout level of the profile's committed files (ADR 0030). A missing key means 0, and `ag` never writes 0. `ag new` writes the Core migration level of the checkout that holds the running `ag`, and each Profile migration raises it in its own commit. `ag sync` refuses while it is below the level of its branch's Core, and warns when it is above.
- `clean: true` makes a Clean profile, which links no store artifacts. `ag` reads it from the Active profile only. `ag new <name> --clean` writes `parent: main` and `clean: true`, so the profile links nothing into any coding agent.

`ag new` writes the file. An `ag` from before a key fails on it with `unknown key`, so a new key reaches a branch only together with the `ag` that reads it. With `--from`, it copies the parent's `local-files`, and copies those local files from the parent's folder.

Every profile links into every Runtime mapping in `sync/runtimes.yaml` (ADR 0018). A `profile.yaml` with a `runtimes` line fails, and the message says to delete the line.

## Linking

`ag sync` links the artifacts of every profile in the Lineage, plus store artifacts and third-party skills. When two sources contribute the same name to one target, sync fails (a Collision). A child never overrides an inherited artifact. It adds one with a different name. This keeps one meaning per name, so an agent never has to guess which version is in force.

## Local files

Local files must stay out of git on every branch, including branches that carry the profile's folder but not its ignore rules. `ag sync` and `ag new` write each Lineage profile's local files into the clone's `.git/info/exclude`, under a marker line, as `/profiles/<name>/<file>`. That file is never committed, so no branch needs a gitignore entry for another profile. As a safety net, the root `.gitignore` ignores every `.env*` file except `*.example` templates and `profiles/.env.active`, so an env file stays out of git before anyone lists it.

## Considered Options

- **Reading the Lineage from git history:** merges make it ambiguous which branch is the parent.
- **Child overrides parent on a name collision:** an agent reading one profile's files could not tell which artifact is in force.
- **Gitignore lines per profile:** a branch without the profile's ignore rules would show its local files as untracked.
- **A per-profile runtimes list:** no profile used it. A profile that dropped a coding agent from its list also left its old links behind in that coding agent.
