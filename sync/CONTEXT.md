# Agent Setup

A canonical store (`~/.agents/`) of skills, rules, commands, and subagents, linked into the Agent home of every configured Coding agent via symlinks. Tooling lives in `sync/`. Artifacts live in `profiles/`, except store artifacts in `artifacts/` and third-party skills in `skills/`, both at the store root.

## Language

**Canonical store**:
The `~/.agents/` directory — the single source of truth for file content. Everything else is a runtime target.
_Avoid_: Source of truth, master, repo root

**Edit worktree**:
A second checkout at `~/.agents-edit`, used to edit and commit any branch other than the Active profile's. `ag edit <branch>` switches it. `ag use` creates it and moves it off the branch being activated, detaching it when `main` is taken. `ag update` uses it for `main` and every ancestor, runs the ancestors' Profile migrations there, then leaves it on `main`. It is never a sync source.
_Avoid_: Base worktree, Ancestor worktree, second clone

**Sync**:
First compare each Lineage profile's Migration level with the Core migration level of `~/.agents`: refuse with its own exit code when a migration is pending, and warn when a profile is above. Then remove every symlink in each runtime target directory, remove the old links the scan finds, and recreate symlinks for every current item in the relevant canonical directories. The scan covers every Agent home the Runtime mappings list and every one Sync remembers syncing on this computer, two levels deep, without following symlinked folders. It removes each symlink there that points into the store's sources (profile folders, store and Core-owner artifact folders, and `skills/`) and that the current plan does not create. It never touches links into `sync/.generated/`. Sync remembers the Agent homes it synced in the clone's git directory. Non-symlink files are left untouched: Blockers stop sync, and Unmanaged artifacts are listed. Handles adds, renames, and removals since the last sync, including Runtime targets and coding agents that Core removed. A missing source directory is skipped with a warning. If every source for a mapping is missing, that target is not cleared, though the scan still removes its links into the store. A source directory with no artifacts contributes none; if at least one source exists, the target is still cleared and recreated. The `instructions` target is the Agent home itself. There the clearing step manages only the names `AGENTS.md` and `CLAUDE.md`, in any letter case, and only the scan removes other links, those into the store's sources. Each Profile branch is synced by its own `ag`, which knows its layout.
_Avoid_: Pull, update, deploy

**Update**:
Fast-forward the Core branch to the Upstream store's Core branch, when there is an Upstream store. A Core branch with commits of its own stops the update. When `sync/bin/ag.mjs` on the Core branch differs from the running `ag`, the rest of the update runs in a new process from that file. Then merge each branch of the Active profile's Lineage with its own parent, from the top down, then sync. Branches that can be pushed pull themselves first. After the merge, each branch runs its pending Profile migrations on its own profile folder, one commit per migration. Branches that can be pushed are then pushed when they are ahead of `origin`. A migration that stops leaves its partial change uncommitted for a person or a coding agent to finish. One that crashes puts the profile folder back to its last commit. Running `ag update` again continues from that migration.
_Avoid_: Sync, rebase, pulling every ancestor into the Active profile

**Runtime target**:
A folder in an Agent home (e.g. `~/.cursor/skills/`) that receives symlinks pointing into the canonical store. Created automatically if the Agent home exists but the target subdirectory does not, with an info message.
_Avoid_: Destination, install location

**Runtime mapping**:
One Coding agent's entry in `sync/runtimes.yaml`: its Agent home, the target folder for each artifact kind, and an optional link extension per kind. `reads-store-skills: true` marks a coding agent that reads third-party skills from `~/.agents/skills/` itself, so sync does not link them into it. Core owns every runtime mapping, and every profile links into every coding agent.
_Avoid_: sync.yaml, a per-profile copy of the mappings, a per-profile runtimes list

**Link mapping**:
One source list paired with one runtime target, worked out by `ag` for each artifact kind of a runtime. The sources are `skills/` (skills only, and not for a coding agent with `reads-store-skills: true`), the kind's store artifacts (not in a Clean profile), the kind's Core-owner artifacts in `artifacts/<kind>-core-me/` (only in a store without an `upstream` remote, and never in a Clean profile), then each Lineage profile's `artifacts/<kind>-profile-me/`, from the top down. The `instructions` kind has only the profile sources. Missing sources are skipped. The mapping runs if any source directory exists.
_Avoid_: Sync rule, path mapping

**Coding agent**:
A tool such as Cursor or Claude Code whose Agent home receives symlinks. Each one is declared by a Runtime mapping in `sync/runtimes.yaml`. The configured coding agents are not a closed set: another compatible one is added with a new mapping. If a coding agent's Agent home doesn't exist on the current machine, sync skips it with a warning.
_Avoid_: Agent (alone), runtime (in prose), IDE, client, provider, treating current mappings as the supported-agent list

**Agent home**:
The global folder of a Coding agent, such as `~/.cursor/`. It holds the Runtime targets. A project's own folders, such as a repository's `.cursor/`, are never agent homes, and `ag` never changes them.
_Avoid_: Agent directory, config folder, user folder

**Runtime support**:
The artifact kinds that `ag sync` links into one Coding agent. A kind is mapped only after its format and behavior are verified in that agent. A Runtime mapping declares files to sync. It does not prove that the agent understands their format or behavior.
_Avoid_: Fully supported, partially supported, primary runtime, assuming runtime neutrality means feature parity

**Collision**:
When two source directories contribute an entry with the same name to the same runtime target, sync aborts with an error. No silent overwrites. A child profile that needs a different artifact gives it a different name. This applies to Global instructions files too, so only one profile in a Lineage can have each one.
_Avoid_: Override, merge conflict, nearest profile wins

**`-me` suffix**:
Marks directories of artifacts authored or maintained by hand (the `<kind>-profile-me` directories inside each profile, and the `<kind>-store-me` and `<kind>-core-me` directories at the store root), as opposed to third-party skills installed by a skills installer.
_Avoid_: Personal, custom, local

**Artifact**:
A symlinkable top-level file or directory inside a canonical source directory that git tracks on the current branch. A directory counts when it holds at least one tracked file. Untracked and ignored entries are not artifacts, and neither are hidden entries (names starting with `.`).
_Avoid_: Item, entry, resource

**Symlink**:
A filesystem link from a runtime target to an artifact in the canonical store. Always uses absolute paths.
_Avoid_: Link, alias, pointer

**Blocker**:
A real file or directory (not a symlink) in a runtime target that occupies the name of an artifact sync needs to create. Sync checks every runtime target first, lists every Blocker, and aborts before it changes any runtime.
_Avoid_: Conflict, obstruction

**Unmanaged artifact**:
A real file or directory in a runtime target that is not a Blocker and not hidden. The store does not manage it. Sync leaves it in place and lists it, with the profile folder to move it into.
_Avoid_: Leftover, orphan, stray file

**Codex parity script**:
`sync/bin/codex-parity-sync.mjs`, a stopgap until sync parity (#2). It gives Codex the commands and rules that Sync links only into Cursor and Claude. It reads them from the Symlinks in `~/.claude/`, generates files into `sync/.generated/codex/`, and links those into `~/.codex/`: rules through `AGENTS.override.md`, and each command as the skill folder `cmd-<name>`. Each run deletes and recreates all its own links. Nothing in `ag` runs it. A machine opts in by putting `sync/bin/ag-codex-parity.mjs` on `PATH` as `ag`, which runs it after every command that syncs, `ag new` included. Sync's scan and `ag status` leave its links alone (ADR 0029).
_Avoid_: Codex sync, Codex mapping, sync parity

**Sync tool**:
The `ag` command-line tool (`sync/bin/ag.mjs`), built mainly for agents. Each store operation is one command that checks state first and, when it refuses, names the fix, so agents do not improvise git steps. Humans run the same commands. It sets up a store cloned from an Upstream store (`ag init`), creates profiles (`ag new`), switches them (`ag use`, which hands Sync to the switched branch's own `ag` when it differs), propagates symlinks (`ag sync`), merges the Lineage and runs Profile migrations (`ag update`), pushes (`ag push`), and reports state, Migration levels included (`ag status`). It also names setup skills (`ag setup`), owners (`ag owner`), switches the Edit worktree (`ag edit`), installs third-party skills (`ag skills add`), turns on push protection (`ag protect`), and files Core issues (`ag issue`). Zero npm dependencies. Tested with `node:test` in `sync/test/`.
_Avoid_: agents-sync, sync script, installer
