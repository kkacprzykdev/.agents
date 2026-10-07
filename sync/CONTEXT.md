# Agent Setup

A canonical store (`~/.agents/`) of skills, rules, commands, and subagents, propagated to any configured coding agent runtime via symlinks. Tooling lives in `sync/`. Artifacts live in `profiles/`, except store artifacts in `artifacts/` and third-party skills in `skills/`, both at the store root.

## Language

**Canonical store**:
The `~/.agents/` directory — the single source of truth for file content. Everything else is a runtime target.
_Avoid_: Source of truth, master, repo root

**Edit worktree**:
A second checkout at `~/.agents-edit`, used to edit and commit any branch other than the Active profile's. `ag edit <branch>` switches it. `ag use` creates it and moves it off the branch being activated, detaching it when `main` is taken. `ag update` uses it for `main` and every ancestor, then leaves it on `main`. It is never a sync source.
_Avoid_: Base worktree, Ancestor worktree, second clone

**Sync**:
Remove every symlink in each runtime target directory, then recreate symlinks for every current item in the relevant canonical directories. Non-symlink files are left untouched: Blockers stop sync, and Unmanaged artifacts are listed. Handles adds, renames, and removals since the last sync. A missing source directory is skipped with a warning. If every source for a mapping is missing, that mapping is skipped and the target is left unchanged. An empty source directory (or one with only hidden entries) contributes no artifacts; if at least one source exists, the target is still cleared and recreated.
_Avoid_: Pull, update, deploy

**Update**:
Fast-forward the Core branch to the Upstream store's Core branch, when there is an Upstream store. A Core branch with commits of its own stops the update. Then merge each branch of the Active profile's Lineage with its own parent, from the top down, then sync. Branches that can be pushed pull themselves first and are pushed when they are ahead of `origin`.
_Avoid_: Sync, rebase, pulling every ancestor into the Active profile

**Runtime target**:
An agent-specific directory (e.g. `~/.cursor/skills/`) that receives symlinks pointing into the canonical store. Created automatically if the agent home exists but the target subdirectory does not, with an info message.
_Avoid_: Destination, install location

**Runtime mapping**:
One runtime's entry in `sync/runtimes.yaml`: its agent home, the target folder for each artifact kind, and an optional link extension per kind. Core owns every runtime mapping. A profile only names the runtimes it uses.
_Avoid_: sync.yaml, a per-profile copy of the mappings

**Link mapping**:
One source list paired with one runtime target, worked out by `ag` for each artifact kind of a runtime. The sources are `skills/` (skills only), the kind's store artifacts, then each Lineage profile's `artifacts/<kind>-profile-me/`, from the top down. Missing sources are skipped. The mapping runs if any source directory exists.
_Avoid_: Sync rule, path mapping

**Agent**:
A coding agent runtime with a home directory that receives symlinks. Agents are declared in `sync/runtimes.yaml`. Cursor and Claude Code are current examples, not a closed supported set. Codex, T3 Code, or another compatible runtime can be added as a new mapping. If an agent's home directory doesn't exist on the current machine, sync skips it with a warning.
_Avoid_: IDE, client, provider, treating current mappings as the supported-agent list

**Runtime support**:
The verified artifact kinds and behaviors available in one Agent. Cursor currently has full coverage of this store. Claude currently has skills, commands, and rules. A Runtime mapping declares files to sync. It does not prove that the Agent understands their format or behavior.
_Avoid_: Assuming runtime neutrality means feature parity, calling a mapped Agent fully supported without verification

**Collision**:
When two source directories contribute an entry with the same name to the same runtime target, sync aborts with an error. No silent overwrites. A child profile that needs a different artifact gives it a different name.
_Avoid_: Override, merge conflict, nearest profile wins

**`-me` suffix**:
Marks directories of artifacts authored or maintained by hand (the `<kind>-profile-me` directories inside each profile and the `<kind>-store-me` directories at the store root), as opposed to third-party skills installed by a skills installer.
_Avoid_: Personal, custom, local

**Artifact**:
A symlinkable top-level file or directory inside a canonical source directory. Hidden entries (names starting with `.`) are excluded.
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

**Sync tool**:
The `ag` command-line tool (`sync/bin/ag.mjs`), built mainly for agents. Each store operation is one command that checks state first and, when it refuses, names the fix, so agents do not improvise git steps. Humans run the same commands. It sets up a store cloned from an Upstream store (`ag init`), creates profiles (`ag new`), switches them (`ag use`), propagates symlinks (`ag sync`), merges the Lineage (`ag update`), pushes (`ag push`), and reports state (`ag status`). It also names setup skills (`ag setup`), owners (`ag owner`), switches the Edit worktree (`ag edit`), installs third-party skills (`ag skills add`), and turns on push protection (`ag protect`). Zero npm dependencies. Tested with `node:test` in `sync/test/`.
_Avoid_: agents-sync, sync script, installer
