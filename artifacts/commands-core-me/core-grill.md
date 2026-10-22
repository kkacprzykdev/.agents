---
description: Grill a Core change of the ~/.agents store read-only, before its spec. Use with a Core issue number or URL.
argument-hint: <issue number or URL>
---

# Grill a Core change

This is the Grilling step of the Core change workflow: Grilling → Spec → Implementation → Merge. The argument the user gave with the command is the Core issue to grill.

When a skill a step needs is missing, name it and stop. The skills come from the Core owner's Lineage, not from Core.

## 1. Bring `main` level with `origin`

Run `ag update`. When it refuses or stops, show its message and stop.

## 2. Read the issue

Read the issue with its comments, as `~/.agents/docs/agents/issue-tracker.md` describes.

## 3. Grill read-only

Load `/grill-with-docs` and `/domain-modeling`, and grill the user on the issue with them.

From here on the session is read-only: it changes no file, makes no commit, and runs no `ag` command that changes state. Docs describe only the current state (`store-docs.mdc`), and the code the design describes does not exist yet. So wherever the skills say to write a doc inline, add the change to a list of **planned doc changes** instead:

- glossary entries to add or change, per `CONTEXT.md`
- ADRs to add, rewrite in place, or delete, following `store-docs.mdc`
- other docs, such as `README.md`, rules, and files in `docs/`

Weigh prior art as ADR 0027 says (`~/.agents/docs/adr/0027-prior-art-informs-decisions.md`). Look it up in a read-only subagent, which returns only short answers.

## 4. Spec

The user decides when the design is clear. Keep grilling until they run `/to-spec`, and maybe `/to-tickets` after it.

The spec carries these sections beside the ones `/to-spec` writes:

- **Testing Decisions:** the seams, agreed with the user. `/core-implement` takes them from the spec and does not ask again.
- **Planned doc changes:** the list from step 3.
- **Prior art:** for each decision, its options and where each came from: the issue, the agent, or a tool.
- **Profile impact:** "None", or the profile files the change moves and the Profile migration that moves them (ADR 0030). Prefer a change that needs no migration, for example one derived at sync time. A change that needs one ships the migration in `sync/migrations/` with its test, in the same PR.
- **Check after merge:** what the user checks on the real machine after merging and running `ag update`. No check runs `ag` in a clone of this store: the clone's `origin` is the real store, so `ag` would push to it. The fake-home tests cover what such a check would show.
- **Pilot findings:** what went wrong or was learned while running the steps by hand, when there is any.
