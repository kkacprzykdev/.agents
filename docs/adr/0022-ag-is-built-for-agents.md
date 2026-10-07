# ag is built for agents

`ag` is built mainly for agents. Every store operation an agent needs is one `ag` command: creating and switching profiles, syncing, merging the Lineage, pushing, installing third-party skills, and setting up a new store. Each command checks the state of both checkouts before it changes anything. When it refuses, its message names the problem and the command that fixes it. So an agent follows the message and never improvises a sequence of raw git steps that could skip a check, push the wrong branch, or leave work half done.

Humans run the same commands. `ag sync`, `ag update`, `ag skills add`, and `ag push` behave the same whoever types them.

ADR 0020 applies this to pushing. Rules in `artifacts/rules-store-me/` tell agents to use `ag` and to treat a refusal as guidance.

## Considered Options

- **Documenting git recipes in rules instead of commands:** an agent would have to follow every step in order and recognize every failure itself. A step it skips or reorders is not caught.
- **A separate interface for humans:** two ways to do one thing would drift apart, and an agent could pick the one without the checks.
