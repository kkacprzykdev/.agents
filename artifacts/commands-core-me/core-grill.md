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

From here on the session is read-only: it changes no file in the store, makes no commit, and runs no `ag` command that changes state. Docs describe only the current state (`store-docs.mdc`), and the code the design describes does not exist yet. So wherever the skills say to write a doc inline, add the change to a list of **planned doc changes** instead:

- glossary entries to add or change, per `CONTEXT.md`
- ADRs to add, rewrite in place, or delete, following `store-docs.mdc`
- other docs, such as `README.md`, rules, and files in `docs/`

Keep a **decision log** for this session in `~/.cache/core-grill/<issue>-<YYYYMMDDTHHMMSS>/decisions.md`, outside the store. A new folder for each session keeps two sessions on the same issue apart. Give its path in Round 1. After every round, add or update one entry for each question: its number, the decision, its options and where each came from (the issue, the agent, or a tool), and its planned doc changes. Review subagents, `/to-spec`, and a new context window read the log, so nothing is rebuilt from memory. Keep the folder after the session.

Before Round 1, start a read-only subagent that maps the code and docs the issue touches, and checks every claim of the issue that it can check.

Weigh prior art as ADR 0027 says (`~/.agents/docs/adr/0027-prior-art-informs-decisions.md`). Look it up in a read-only subagent, which returns only short answers.

Wait for every subagent you started, for prior art or for facts, before you ask the user anything. This replaces the "Don't block on it" advice of `/grilling`: ask no question of any round while a subagent runs, because its result can change or repeat them. Until it reports, end each turn with one line that says what you wait for. When it reports, merge its result into the design, then write the next round again, so that no question overlaps an earlier one.

Write each round in plain, short sentences, with the glossary terms of `CONTEXT.md`. Give each question a concrete example, such as which computer, which command, and what the user sees, and your recommendation.

A question keeps its number for the whole session, also when you write a round again. A reopened question keeps its number and says "reopened". A question that no longer needs an answer keeps its number and says "not needed", with the reason, for example `Q15 - not needed: Q12 removed the marker file`. A new question takes the next free number.

One spec ships the whole change. Propose a follow-up issue only when the user asks for one.

## 4. Review the decision log

The user decides when the design is clear. Keep grilling until they request `to-spec` or `/to-spec`. That request starts this review automatically, before spec creation.

Update `decisions.md` with the latest answers, then start a read-only review subagent. Give it the decision log, the full session transcript (including earlier rounds and corrections), and the original issue with its comments. The reviewer compares the log against the discussion, not just a summary or the log itself. If the full transcript cannot be retrieved, say what is missing and resolve that gap before continuing.

Ask it to report missing or misstated decisions, contradictions, rejected or superseded options presented as agreed, and proposals presented as user decisions. It also checks that the log preserves agreed details, options and their sources, planned doc changes, testing decisions, and checks after merge. Each finding cites the relevant discussion and log entry. Wait for it, as step 3 says.

- **A finding that only restores what the user agreed:** verify it against the discussion, fix the decision log, and list the fixes for the user.
- **A finding that needs a new decision:** ask it in the next round, keeping the question numbering from step 3. Record the answer before continuing.

Once every finding is resolved and the log reflects the latest answers, continue automatically to step 5. The user does not need to request `to-spec` again. This review is separate from the spec review in step 6.

## 5. Spec

Run `/to-spec` using the reviewed decision log and the conversation.

The spec carries these sections beside the ones `/to-spec` writes:

- **Testing Decisions:** the seams, agreed with the user. `/core-implement` takes them from the spec and does not ask again.
- **Planned doc changes:** the list from step 3.
- **Prior art:** for each decision, its options and where each came from (the issue, the agent, or a tool), as the decision log records them.
- **Profile impact:** "None", or the profile files the change moves and the Profile migration that moves them (ADR 0030). Prefer a change that needs no migration, for example one derived at sync time. A change that needs one ships the migration in `sync/migrations/` with its test, in the same PR.
- **Check after merge:** what the user checks on the real machine after merging and running `ag update`. No check runs `ag` in a clone of this store: the clone's `origin` is the real store, so `ag` would push to it. The fake-home tests cover what such a check would show.
- **Pilot findings:** what went wrong or was learned while running the steps by hand, when there is any.

In every section of the spec except Check after merge, name domain concepts with glossary terms. Use a path or a code snippet only where the user explicitly chose or accepted that exact path or code during the session, and write it into the spec, because `/core-implement` reads only the issue. This replaces the "no file paths or code snippets" rule of `/to-spec` and `/to-tickets`, and their prototype exception. Name each doc, ADR, and test seam so that it can't be mistaken: by its title, its ADR number, or an agreed path. When a domain concept has no glossary term, describe it in plain words. When the design depends on it, ask the user for a term before `/to-spec`, and add the term to the planned doc changes. Check after merge may use real paths and commands, because the user runs its steps right after merging.

## 6. Review the spec

When `/to-spec` has published the spec, start a read-only review subagent. Give it the spec issue, the decision log, the session transcript's file path, and step 5 of this command. It reports decisions the spec misses, decisions it states wrongly, and breaks of step 5. Wait for it, as step 3 says.

- **A finding that only restates a decision the user made:** fix it in the spec issue's body, and list the fixes for the user.
- **A finding that needs a new decision:** ask it in a last round, with the next free numbers. Then add the decisions to the decision log and to the spec issue's body.

## 7. Close the original issue

Offer to comment on the original issue that the spec supersedes it, with a link to the spec, and to close it. Do it only when the user agrees. Then suggest `/to-tickets`, to split the spec into tickets, or `/core-implement` with the spec.
