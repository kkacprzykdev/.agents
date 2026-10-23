# One Edit worktree for every other branch

`~/.agents` always has the Active profile's branch checked out, because `ag sync` links from it. Every other branch is edited in one second checkout, the Edit worktree at `~/.agents-edit`. `ag edit <branch>` switches it to any branch except the one in `~/.agents`, and pulls that branch from `origin` when it can be pushed. `ag update` uses it for `main` and every ancestor in the Lineage, runs the ancestors' Profile migrations there (ADR 0030), then leaves it on `main`. So every run ends in the same state, even a rerun after a conflict.

`ag` manages the worktree. `ag use` creates it on `main` when it is missing, and moves it off the branch it is about to check out in `~/.agents`, so the two checkouts never hold the same branch. It moves the worktree to `main`, or detaches it when `~/.agents` holds `main`. Every command that switches, merges, commits, or pushes refuses to start while either checkout has uncommitted changes or an unfinished merge, rebase, cherry-pick, or revert. Every command prunes the worktree list first, so a worktree folder deleted by hand is forgotten, and recreated when needed.

The Edit worktree is never a sync source. Runtimes link only from `~/.agents`.

Each Profile branch is synced by its own `ag`, because that `ag` knows the branch's layout. `ag use` reads its own `ag` file before it switches `~/.agents`. When the switched branch's `sync/bin/ag.mjs` differs, it runs that file's `ag sync` in a new process. When the sync refuses because a migration is pending, the switch stays, so `ag update` can finish the migration. When it fails for any other reason, `ag use` switches `~/.agents` back, so the checkout and the agent homes stay on the same profile. `ag new` sets the worktree up the same way, but leaves the sync to its final `ag update`.

A Core change worktree is not the Edit worktree, and `ag` does not manage it.

## Considered Options

- **One worktree per ancestor branch:** a deep Lineage would need many checkouts, and each would need its own setup.
- **Switching `~/.agents` itself to edit an ancestor:** runtimes would link the wrong profile until it switches back.
- **A second clone:** it would need its own fetches and pushes, and could fall behind `~/.agents`.
