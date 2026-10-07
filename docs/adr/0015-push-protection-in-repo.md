# Push protection lives in the repository

A committed `.githooks/pre-push` hook rejects any push that contains a commit whose tree has `profiles/<protected>/`. Protected profiles are listed in local git config (`ag.noPush`), set once per clone by `ag protect <profile>` or `ag new --protect`. It also sets `branch.<profile>.pushRemote=no_push`. Protection is optional and explicit.

The guard must work in every store, whatever host and plan its repository uses. A private repository on a free GitHub plan has no branch rules, so the guard is local. Checking commit contents, not branch names, also catches every profile created from a protected profile, because its branch carries the protected folder. The hook is committed on `main`, so every branch and worktree has it. `ag push` and `ag update` run the same test before they push: a branch is local only when any commit `origin` does not have yet contains a protected folder. So agents never hit the hook (ADR 0020).

## Consequences

`git push --no-verify` bypasses the hook. The guard prevents accidents, not intent.
