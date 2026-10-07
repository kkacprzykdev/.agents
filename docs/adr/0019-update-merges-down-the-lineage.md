# ag update merges down the Lineage

When the store has an `upstream` remote, `ag update` first fast-forwards `main` to `upstream/main` (ADR 0023). It then pushes `main` when the local `main` has commits `origin` does not, pulling `origin/main` into it first, because every Root profile merges `main` from `origin`. Then it walks the Active profile's Lineage from the top down. Each branch merges only its own parent. A branch that can be pushed first pulls itself from `origin`. It merges its parent from `origin` when the parent can be pushed, which `main` always can, or from the local branch when the parent is local only. A branch that can be pushed and is ahead of `origin` is pushed. Ancestors are updated in the Edit worktree. The Active profile is updated last, in `~/.agents`, then `ag sync` runs.

It always merges with `--no-rebase`, so a branch's history is never rewritten. A branch that is already up to date gets no new commit. `ag update` refuses to start while either checkout has uncommitted changes or an unfinished git operation. It writes the Lineage's local files into `.git/info/exclude` before that check, so a file just listed in `local-files` is not a change.

On a conflict it shows git's own output, plus one line naming the checkout and branch, and stops. It runs no AI and offers no resolution. Running it again after the conflict is committed continues from there, because finished merges have nothing left to do.

Agents run `ag update` after every push, so a change on any branch reaches the Active profile at once.

## Considered Options

- **Merging every ancestor straight into the Active profile:** a middle profile would never receive its own parent's changes, and later merges would repeat the same conflicts.
- **Rebasing a child onto its parent:** the rewritten branch would need a force push.
