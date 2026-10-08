# Each user owns a store, and Core comes read-only from an Upstream store

Someone who builds on this store keeps their own copy of it, in a repository they own. Its `origin` remote is that repository, and every `ag` push goes there. The store they cloned is their Upstream store, reached through a second remote named `upstream`. They can read it but never push to it.

`ag init` turns a fresh clone into such a store. It renames the clone's `origin` to `upstream`, adds the user's own repository as `origin`, and pushes `main` there. Without a URL it creates a private repository with the GitHub CLI.

In a store with an `upstream` remote, Core is read-only. Only the Upstream store changes it. A commit of the user's own on `main`, or a Core file changed on a profile branch, would conflict with a later Core change from the Upstream store. So `ag` keeps every edit away from Core:

- `ag status` prints `Core: read-only, from <url>`.
- `ag owner` refuses every Core path, and `ag edit main` refuses too. Their message says where the change goes instead. A store-level artifact goes in a profile. A change to `ag`, the docs, or the runtime mappings goes in an issue on the Upstream store. A user who wants to own Core removes the `upstream` remote.
- `ag update` fast-forwards `main` to `upstream/main` in the Edit worktree before anything else. Then it pushes `main` to `origin`, and the Lineage merges it down as usual (ADR 0019). When `main` or `origin/main` has commits that `upstream/main` lacks, `ag update` stops before it merges or pushes anything. It lists those commits and prints the commands that reset `main` to `upstream/main`. Those commands drop commits, so an agent asks the user before it runs them.
- `ag push` runs the same check when a checkout is on `main`, and pushes nothing while `main` has such commits. The Edit worktree rests on `main`, so a raw `git commit` there would otherwise reach `origin` unnoticed.
- The committed `pre-commit` hook rejects raw commits. It rejects any commit on `main`, and any commit on another branch that stages a path outside `profiles/`, `skills/`, and `.skill-lock.json`. A commit that concludes a merge passes, because merging `main` into a profile carries Core changes. `git commit --no-verify` skips the hook, and `ag push` and `ag update` still catch a commit on `main` made that way.

The `upstream` remote is the whole test. A store without one, such as the Upstream store itself, owns its Core: `ag status` prints `Core: owned by this store`, and Core is edited on `main` as usual. The store rule `edit-agents-store.mdc` tells agents to read that line first.

## Considered Options

- **A GitHub fork:** a fork of a public repository is always public, so every profile pushed to it is published unless it is a Protected profile. GitHub's "Sync fork" button also has to be pressed by hand. A fork still works: adding an `upstream` remote to it gives it the same updates.
- **A template repository:** the copy shares no history with the Upstream store, so every later Core change merges as unrelated history.
- **Merging upstream only on a separate command:** Core changes would reach profiles only when someone remembers to run it, unlike every other change, which `ag update` brings down at once.
- **Merging `upstream/main` into a `main` with its own commits:** the merge works until both sides change the same file. Then the user meets a conflict in Core they never meant to own.
- **Guarding only through `ag`:** agents follow `ag owner`, but a human who commits with raw git would meet the mistake only at `ag push`, or as a merge conflict much later when the change is on a profile branch. The hook keeps a second copy of the Core paths that `ag owner` uses, and that cost is accepted.
- **An explicit flag such as `ag.coreFromUpstream`, or comparing the `upstream` and `origin` URLs:** both add state that the `upstream` remote already gives.
