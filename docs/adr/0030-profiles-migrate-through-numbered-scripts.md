# Profiles migrate through numbered scripts in Core

A Core change can move where a profile keeps its files. Merges bring the new Core to every profile branch (ADR 0011), but not the profile's files into the new layout. Core first tries to avoid that change, for example by deriving a value at sync time. When it cannot, it ships a Profile migration: a module in `sync/migrations/`, named by a four-digit number and a slug, such as `0001-move-rules.mjs`.

A migration exports one function, `migrate(profileDir)`. It returns `{ status: "done" }`, or `{ status: "stop", instructions, commitMessage }` when the change needs a decision. It throws only on a bug. It checks the state of the files itself and is safe to run twice, so nothing marks it as started or dirty. It changes only committed files in its own profile folder, `profile.yaml` included. It never changes a local file or moves a folder that holds one, and never touches third-party skills, other profiles, or git metadata. A Clean profile is migrated like any other.

Each profile records its Migration level as `migration-level` in its `profile.yaml` (ADR 0017). The Core migration level is the number of migrations in one checkout's `sync/migrations/`, never `origin`'s. Numbers start at `0001`, have no gaps, and never repeat, and `ag` refuses a folder that breaks this. Once on `main`, a migration's number and content never change, because a profile that ran the old version would never run an edited one. A bug is fixed by a new migration. A test checks the numbering, and `main` accepts only branches that are up to date with it, so two changes cannot take one number unnoticed.

`ag update` runs the migrations (ADR 0019). After a branch merges its parent, every migration above its level runs in number order, loaded from the checkout that holds the branch. Each gets one commit that raises the level, staging only the profile's own folder, so the pre-commit hook of a store with an Upstream store accepts it. So a branch is always at a whole level, and two computers that migrate the same branch make the same files. A stop leaves its partial change uncommitted for a person or a coding agent to finish and commit, and the rerun finds the work done. A crash puts the profile folder back to its last commit, keeping ignored local files. One message serves people and agents, as ADR 0022 asks.

`ag sync` refuses while a Lineage profile is below the level of its checkout's Core, with exit code 3, which no other failure uses, so `ag use` can keep the switch for `ag update` to finish. It warns when a profile is above, after a hand edit or a stopped `ag new`. `ag new` writes the running `ag`'s level, read before the switch, and its final `ag update` fixes any difference.

## Considered Options

- **The level in its own file:** an old `ag` would not fail on an unknown key in `profile.yaml`. That gap closes after one `ag update` on each branch, and a second file per profile stays forever.
- **No level, with each migration detecting the old shape:** every migration would run on every update, and `ag sync` could not tell a pending migration without running them.
- **A dirty flag that blocks until a person forces it:** migrations that are safe to run twice need no flag, and a stop already leaves its work for a person.
- **A graph of parent links, or timestamps, instead of numbers:** concurrent changes could merge without renumbering, but the order would no longer be one plain sequence. Up-to-date branches and the numbering test catch a collision before merge.
- **Migrations run by `ag use` or `ag sync`:** switching or syncing would commit and push. Only `ag update` merges, so only it migrates.
- **Replaying migrations in `ag new` on a frozen skeleton:** every migration would also need an old skeleton to start from. Today's skeleton plus the final `ag update` reaches the same files.
- **Migrating local files too:** a committed level cannot track files that are never committed, so they would need a level on each computer. A change to local files is derived at sync time instead.

## Consequences

An `ag` from before this change fails with `unknown key "migration-level"` when it syncs a profile that has the key. Running `ag sync` again works, because the branch's own `ag` then runs. Every Core change states its Profile impact, and one that moves profile files ships its migration with a test.
