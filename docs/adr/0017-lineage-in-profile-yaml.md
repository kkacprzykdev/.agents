# The Lineage is declared in profile.yaml

Each profile has a committed `profiles/<name>/profile.yaml`:

```yaml
parent: default
runtimes: [cursor, claude]
local-files: [.env, .env.outputs]
```

- `parent` names the one Parent profile, or `main` for a Root profile. `ag` follows it to build the Lineage, at any depth.
- `runtimes` lists the runtime mappings the profile uses. Without it, the profile uses every mapping in `sync/runtimes.yaml`.
- `local-files` lists the profile's files that are never committed, relative to its folder.

`ag new` writes the file. With `--from`, it copies the parent's `runtimes` and `local-files`, and copies those local files from the parent's folder.

## Linking

`ag sync` links the artifacts of every profile in the Lineage, plus store artifacts and third-party skills. When two sources contribute the same name to one target, sync fails (a Collision). A child never overrides an inherited artifact. It adds one with a different name. This keeps one meaning per name, so an agent never has to guess which version is in force.

## Local files

Local files must stay out of git on every branch, including branches that carry the profile's folder but not its ignore rules. `ag sync` and `ag new` write each Lineage profile's local files into the clone's `.git/info/exclude`, under a marker line, as `/profiles/<name>/<file>`. That file is never committed, so no branch needs a gitignore entry for another profile. As a safety net, the root `.gitignore` ignores every `.env*` file except `*.example` templates and `profiles/.env.active`, so an env file stays out of git before anyone lists it.

## Considered Options

- **Reading the Lineage from git history:** merges make it ambiguous which branch is the parent.
- **Child overrides parent on a name collision:** an agent reading one profile's files could not tell which artifact is in force.
- **Gitignore lines per profile:** a branch without the profile's ignore rules would show its local files as untracked.
