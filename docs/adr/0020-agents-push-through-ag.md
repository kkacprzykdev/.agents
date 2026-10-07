# Agents commit and push through ag without asking

After every store change, an agent commits in the checkout it edited, runs `ag push`, then `ag update`. It does not ask first. Any mistake can be reverted from history.

`ag push` pushes the branch of `~/.agents` and the branch of the Edit worktree, each when it is ahead of `origin`, and sets the upstream on the first push. It does not depend on the directory it runs from, so an agent cannot push the wrong checkout by accident. When a branch has a commit `origin` does not have yet that contains a Protected profile's folder, it pushes nothing for that branch, prints that the branch is local only, and exits successfully. So an agent never runs into the pre-push hook and never has to decide whether a branch may be pushed. Agents never run `git push` and never use `--no-verify`.

Humans may run `git push`. The pre-push hook still rejects a protected branch (ADR 0015).

This is one case of ADR 0022: every store operation an agent needs goes through `ag`.

## Considered Options

- **Asking before each commit or push:** every small edit would stop for a confirmation that adds no safety, because history can always be reverted.
- **Letting agents run `git push`:** an agent would hit the hook on a protected branch, and would have to recognize the rejection as expected.
