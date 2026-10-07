---
name: find-free-checkout
description: >-
  Find a free TreeStatus checkout for new work. Use when starting implementation,
  needing a working directory, switching projects, or when the human asks where
  to work / which worktree to use. Runs treestatus list --json --all-views first.
---

# Find a free checkout (TreeStatus)

Obtain a **free** checkout for the **target project** using TreeStatus.

**TreeStatus glossary:** Read **TREESTATUS_REPO** from the Profile setup (`profile-references.mdc`, Read the Profile setup), and open `{TREESTATUS_REPO}/CONTEXT.md` for TreeStatus terms (free, checkout, primary, linked worktree, target project, make ready, default branch). That file lives in the TreeStatus **source** clone. It is not `~/.agents/CONTEXT.md`, and not a target-project checkout from `treestatus list`. If `.env`, the key, or that `CONTEXT.md` is missing, skip the glossary. This skill's steps are enough to pick a checkout.

**Never** start implementation without a known checkout path. **Never** auto-answer stash / discard / pull. **Never** create linked worktrees via TreeStatus (not supported yet).

## First command

```bash
treestatus list --json --all-views
```

Expect envelope `{ viewIds, checkouts }`. Each checkout includes at least: `path`, `ready_branch`, `current_branch`, `status`, `working_tree`, `reason`, `free`, `primary`, `primary_path`, `default_branch`, `up_to_date`.

On ordinary list, `up_to_date` is always `null`. Do not treat `default_branch` or `up_to_date` as freeness signals.

## Prerequisite failure

If TreeStatus is missing from `PATH`, has no views, exits non-zero, or returns empty/unusable JSON:

1. **Stop.** Explain why discovery failed and what the human can fix (`treestatus` install/link, `treestatus init`, paste the CLI error).
2. Do **not** fall back to ad-hoc `git worktree list` or guessing folders.
3. Even if the human already gave full implementation details, **do not start implementing**. Ask them to name the repository / checkout path, echo it for a short confirmation, and wait.
4. That human-named path is the working location for the **current** target project even if TreeStatus stays broken.
5. Re-run TreeStatus later only when resolving a **new** target project — not to second-guess the path already confirmed for current work.

## Resolve target project

Group inventory rows by `primary_path`.

| Distinct `primary_path` values | Action |
|---|---|
| Exactly one | That project is the target — no confirmation step. |
| Two or more | Infer when possible (human named a matching path, or cwd equals/is inside exactly one listed checkout `path` → that row’s `primary_path`). **Always confirm** the target with the human before selecting. If inference is ambiguous, ask without a preferred guess (or say it is unclear). |

If the human later asks for work in a different project (e.g. server after client), resolve a new target project — re-run all-views list when TreeStatus is usable — rather than reusing the previous checkout.

## Select a free checkout

Within the target project, `free === true` is sufficient to start work (once the target is known). Do not gate on `up_to_date` or `default_branch`.

Selection order:

1. Prefer a **free linked worktree** (`primary === false`) over a free primary.
2. If several linked worktrees are free, take the **first** free linked worktree in JSON array order.
3. If only the **primary** is free, use it.
4. If none are free → **nothing-free recovery**.

## Nothing-free recovery

Preferred option: ask whether to **make ready** an existing checkout in the target project.

**Make-ready candidates** — only configured, reachable checkouts in one of:

- busy + clean
- busy + dirty
- ready + dirty

(Exactly the non-free cases make ready can fix. Free is ready + clean.)

Among candidates, prefer a linked worktree. If several remain, ask which path. If only the primary qualifies, offer that.

- Get an **explicit yes** before running make ready.
- If no candidates (all unconfigured / missing / error): do **not** offer make ready; point at `treestatus configure` and/or fixing unreachable paths.

**Alternative:** human creates a new linked worktree **outside** TreeStatus, then re-run list JSON and continue selection.

## Agent make ready invocation

Collect every decision in **one** up-front human prompt:

- If dirty: stash vs discard vs cancel
- Whether to pull latest from the **default branch** after the checkout is on its ready branch (ask for clean busy as well)

Map answers to flags. Prefer the path form — do **not** drive the interactive picker:

```bash
treestatus ready <path> [--stash|--discard] [--pull]
```

Examples:

```bash
treestatus ready /path/to/wt --stash --pull
treestatus ready /path/to/wt --discard
treestatus ready /path/to/wt --pull
```

If make ready refuses for an in-progress git operation, surface that and **stop**. Do not invent abort/continue git commands unless the human asks.

While any remaining CLI decision appears, relay it to the human — never auto-answer.

## Decision tree (summary)

```text
list --json --all-views
  ├─ failure → explain; ask human for path + confirm; use that path
  └─ ok
       ├─ resolve target project (confirm if multiple primary_path)
       ├─ free linked worktree? → use first in JSON order
       ├─ only free primary? → use primary
       └─ nothing free
            ├─ make-ready candidates?
            │    ├─ ask yes + stash/discard/cancel + pull
            │    └─ treestatus ready <path> [--stash|--discard] [--pull]
            └─ else → configure / fix paths; or human creates worktree outside TreeStatus
```
