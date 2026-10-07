# One Edit worktree for every other branch

`~/.agents` always has the Active profile's branch checked out, because `ag sync` links from it. Every other branch is edited in one second checkout, the Edit worktree at `~/.agents-edit`. `ag edit <branch>` switches it to any branch except the one in `~/.agents`, and pulls that branch from `origin` when it can be pushed. `ag update` uses it for `main` and every ancestor in the Lineage, then leaves it on `main`. So every run ends in the same state, even a rerun after a conflict.

`ag` manages the worktree. `ag use` creates it on `main` when it is missing, and moves it off the branch it is about to check out in `~/.agents`, so the two checkouts never hold the same branch. It moves the worktree to `main`, or detaches it when `~/.agents` holds `main`. Every command that switches, merges, commits, or pushes refuses to start while either checkout has uncommitted changes or an unfinished merge, rebase, cherry-pick, or revert. Every command prunes the worktree list first, so a worktree folder deleted by hand is forgotten, and recreated when needed.

The Edit worktree is never a sync source. Runtimes link only from `~/.agents`.

## Considered Options

- **One worktree per ancestor branch:** a deep Lineage would need many checkouts, and each would need its own setup.
- **Switching `~/.agents` itself to edit an ancestor:** runtimes would link the wrong profile until it switches back.
- **A second clone:** it would need its own fetches and pushes, and could fall behind `~/.agents`.
