---
---

# Setup Branch Merge Rules

Configures a GitHub repository with a two-branch promotion workflow:

- One protected "production" branch (e.g. `main`) that only accepts **merge commits** from PRs.
- Every other branch (e.g. `develop`, feature branches) only accepts **squash merges** from PRs.
- Direct pushes, force pushes, and deletion of the protected branch are blocked for everyone, including admins.
- The repository's root `README.md` is updated with a "Branching & merge rules" section that documents the enforced workflow for contributors.

## Slash Command

```
You are about to configure GitHub branch protection and merge rules on a repository.

## Inputs

1. **GitHub repository URL or slug** — provided by the user as a command argument (e.g. `https://github.com/owner/repo`, `github.com/owner/repo`, or `owner/repo`). If the user did not provide one, ask for it before proceeding.
2. **Protected branch name** — ALWAYS ask the user which branch should be the "production / merge-commit only" branch. Do not assume `main`. Offer `main` as the default suggestion, but wait for the user's confirmation before proceeding.
3. **Non-protected long-lived working branch** (optional) — ask the user whether they have a second long-lived branch used for ongoing development (e.g. `develop`, `staging`). This is used later when updating the README. If they only use one long-lived branch, the README template is simplified accordingly.

Normalize the input: extract `owner/repo` from any URL-style input. Store it in a variable (e.g. `REPO`). Store the branch name in `BRANCH` and the working branch (if any) in `WORKING_BRANCH`.

## Prechecks

Before making any changes, run the following with the `Shell` tool and show the output to the user:

1. Verify `gh` is authenticated and can see the repo:
   ```bash
   gh api repos/<REPO> --jq '{full_name, default_branch, private}'
   ```
   If this fails, stop and ask the user to authenticate with `gh auth login`.

2. Confirm the specified branch exists:
   ```bash
   gh api repos/<REPO>/branches/<BRANCH> --jq '{name, commit: .commit.sha[0:7], protected}'
   ```
   If it doesn't exist, ask the user whether to pick a different branch.

3. Check current merge-method settings and existing rulesets:
   ```bash
   gh api repos/<REPO> --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'
   gh api repos/<REPO>/rulesets --jq '.[] | {id, name, target, enforcement}'
   ```

4. Warn the user if rulesets named `<BRANCH>: merge-commit only` or `non-<BRANCH>: squash only` already exist. Offer to delete-and-recreate them, or to abort. Do not silently overwrite.

## Plan and confirm

After the prechecks, print a short plan of exactly what will be changed and ASK the user to confirm before executing:

- Repo merge methods will be set to `allow_merge_commit=true`, `allow_squash_merge=true` (rebase left untouched unless the user wants it disabled too).
- Ruleset `<BRANCH>: merge-commit only` will be created targeting `refs/heads/<BRANCH>`, allowing only `merge`.
- Ruleset `non-<BRANCH>: squash only` will be created targeting `~ALL` but excluding `refs/heads/<BRANCH>`, allowing only `squash`.
- Classic branch protection on `<BRANCH>` will have `enforce_admins` enabled so direct pushes are blocked for everyone.
- The repo's root `README.md` will be updated with a "Branching & merge rules" section that documents the workflow (or the section will be created if it doesn't exist yet). The user will do this change via a short-lived feature branch and a PR into `<BRANCH>` so the new rules are immediately exercised.

Wait for the user's approval. Only proceed after they confirm.

## Execution

Run these `Shell` commands in sequence. Show each command's output back to the user.

### 1. Enable both merge methods repo-wide

Rulesets can only allow from methods enabled at the repo level, so this must run first.

```bash
gh api -X PATCH repos/<REPO> \
  -F allow_merge_commit=true \
  -F allow_squash_merge=true \
  --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'
```

### 2. Create ruleset for the protected branch (merge-commit only)

```bash
gh api -X POST repos/<REPO>/rulesets --input - <<EOF
{
  "name": "<BRANCH>: merge-commit only",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/<BRANCH>"], "exclude": [] }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge"],
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    }
  ]
}
EOF
```

Capture the returned `id` and surface it to the user (it becomes the URL `https://github.com/<REPO>/rules/<id>`).

### 3. Create ruleset for all other branches (squash only)

```bash
gh api -X POST repos/<REPO>/rulesets --input - <<EOF
{
  "name": "non-<BRANCH>: squash only",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~ALL"], "exclude": ["refs/heads/<BRANCH>"] }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["squash"],
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    }
  ]
}
EOF
```

### 4. Ensure classic branch protection exists on the protected branch, then enforce it on admins

If `gh api repos/<REPO>/branches/<BRANCH>/protection` returns 404 (no classic protection yet), create a minimal one first:

```bash
gh api -X PUT repos/<REPO>/branches/<BRANCH>/protection --input - <<EOF
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

Otherwise, just enable admin enforcement on the existing protection:

```bash
gh api -X POST repos/<REPO>/branches/<BRANCH>/protection/enforce_admins
```

### 5. Update the repository's README with a "Branching & merge rules" section

Ask the user whether they want to add/update the documentation section in the repo's root `README.md`. If they say no, skip to Verification.

If they agree, do the following:

1. Ask the user to confirm or provide:
   - The local path to their working copy of the repo (so you can run `git` and edit files). If they don't have one, offer to `git clone` it into a temp directory and push from there.
   - The name of the non-protected working branch used for ongoing development (e.g. `develop`). If the repo has only one long-lived branch (`<BRANCH>`), tell the user the README section should omit the promotion flow and instead describe a single-branch + feature-branch workflow — ask them to confirm that simpler version.

2. Inside the local working copy, create a fresh branch off the non-protected branch (or off `<BRANCH>` if there is no other long-lived branch):

   ```bash
   git fetch origin
   git checkout -b docs/branch-merge-rules origin/<WORKING_BRANCH>
   ```

3. Read the current `README.md`. If a section titled `## Branching & merge rules` already exists, replace it. Otherwise, insert the new section at a sensible location (before a "Deployment" / "Contributing" section if present, otherwise at the end of the file).

4. Use the template below for the new section. Before writing it, perform the following substitutions everywhere:

   - `<BRANCH>` → the protected branch name (e.g. `main`)
   - `<WORKING_BRANCH>` → the non-protected long-lived branch (e.g. `develop`)
   - `<REPO>` → the `owner/repo` slug
   - `<MAIN_RULESET_ID>` → the id returned in step 2
   - `<NON_MAIN_RULESET_ID>` → the id returned in step 3

   Template:

   ````markdown
   ## Branching & merge rules

   This repo uses a two-branch promotion flow (`feature` → `<WORKING_BRANCH>` → `<BRANCH>`), enforced by GitHub rulesets so everyone follows the same workflow.

   ### Branch roles

   - **`<BRANCH>`** — production. Commits here trigger production deploys.
   - **`<WORKING_BRANCH>`** — staging / dev environment. Commits here trigger staging deploys.
   - **`<feature-branch>`** — short-lived branches for individual changes. Always branched off `<WORKING_BRANCH>`.

   ### Workflow

   1. Create a feature branch from `<WORKING_BRANCH>`:

      ```bash
      git checkout <WORKING_BRANCH>
      git pull
      git checkout -b my-feature
      ```

   2. Open a PR from your feature branch into `<WORKING_BRANCH>`. Merge it using **Squash and merge**. This produces **one clean commit** on `<WORKING_BRANCH>` per feature.
   3. When ready to promote to production, open a PR from `<WORKING_BRANCH>` into `<BRANCH>`. Merge it using **Create a merge commit**. This preserves `<WORKING_BRANCH>`'s commits and adds a merge commit as a "release marker" on `<BRANCH>`.
   4. Delete the feature branch after step 2.

   ### Enforced rules

   | PR target | Allowed merge method | Why |
   |---|---|---|
   | `<BRANCH>` | **Create a merge commit** only | Keeps `<WORKING_BRANCH>`'s history reachable from `<BRANCH>` so future `<WORKING_BRANCH>` → `<BRANCH>` PRs don't list stale commits. The merge commit also acts as a release marker for `git revert -m 1 <sha>`. |
   | Any other branch (`<WORKING_BRANCH>`, feature branches) | **Squash and merge** only | Collapses messy work-in-progress commits into a single clean commit on the target branch. |

   Both rules are enforced by branch rulesets:

   - [`<BRANCH>: merge-commit only`](https://github.com/<REPO>/rules/<MAIN_RULESET_ID>)
   - [`non-<BRANCH>: squash only`](https://github.com/<REPO>/rules/<NON_MAIN_RULESET_ID>)

   If you pick the wrong merge option in the UI, GitHub will block the merge with a ruleset error.

   ### `<BRANCH>` protection

   - Direct pushes to `<BRANCH>` are **blocked for everyone, including admins** (`enforce_admins: true`).
   - Force pushes and branch deletion on `<BRANCH>` are blocked.
   - All changes to `<BRANCH>` must go through a pull request.

   If you ever need an emergency hotfix that can't wait for the normal flow, a repo admin can temporarily disable admin enforcement:

   ```bash
   gh api -X DELETE repos/<REPO>/branches/<BRANCH>/protection/enforce_admins
   # do the hotfix push
   gh api -X POST repos/<REPO>/branches/<BRANCH>/protection/enforce_admins
   ```

   ### Why this setup

   When a long-lived branch is squash-merged into another long-lived branch, the original commits keep different SHAs between the two branches, and Git considers them diverged. Every subsequent promotion PR then lists stale commits that are already present on the target branch under a different SHA. Using "Create a merge commit" for `<WORKING_BRANCH>` → `<BRANCH>` keeps the two branches' histories consistent, at the cost of one extra merge commit per release (which is a feature, not a bug — it's a clear release marker).
   ````

   If the user confirmed there is no separate working branch (single-branch flow), use this simpler template instead:

   ````markdown
   ## Branching & merge rules

   This repo uses a single long-lived branch (`<BRANCH>`) plus short-lived feature branches. Merge rules are enforced by GitHub rulesets.

   ### Workflow

   1. Create a feature branch from `<BRANCH>`:

      ```bash
      git checkout <BRANCH>
      git pull
      git checkout -b my-feature
      ```

   2. Open a PR from your feature branch into `<BRANCH>`. Merge it using **Create a merge commit**.
   3. Delete the feature branch after merging.

   ### Enforced rules

   | PR target | Allowed merge method |
   |---|---|
   | `<BRANCH>` | **Create a merge commit** only |
   | Any other branch | **Squash and merge** only |

   Enforced by branch rulesets:

   - [`<BRANCH>: merge-commit only`](https://github.com/<REPO>/rules/<MAIN_RULESET_ID>)
   - [`non-<BRANCH>: squash only`](https://github.com/<REPO>/rules/<NON_MAIN_RULESET_ID>)

   ### `<BRANCH>` protection

   - Direct pushes to `<BRANCH>` are **blocked for everyone, including admins** (`enforce_admins: true`).
   - Force pushes and branch deletion on `<BRANCH>` are blocked.
   - All changes to `<BRANCH>` must go through a pull request.

   Emergency hotfix escape hatch for admins:

   ```bash
   gh api -X DELETE repos/<REPO>/branches/<BRANCH>/protection/enforce_admins
   # do the hotfix push
   gh api -X POST repos/<REPO>/branches/<BRANCH>/protection/enforce_admins
   ```
   ````

5. Commit, push, and open a PR:

   ```bash
   git add README.md
   git commit -m "Document branching & merge rules"
   git push -u origin docs/branch-merge-rules
   gh pr create \
     --repo <REPO> \
     --base <WORKING_BRANCH> \
     --head docs/branch-merge-rules \
     --title "Document branching & merge rules" \
     --body "Adds a 'Branching & merge rules' section to the README describing the GitHub ruleset configuration that was just applied to this repository."
   ```

   If there is no separate working branch, target `<BRANCH>` instead of `<WORKING_BRANCH>` and let the user merge it via the normal PR flow (it will be the first PR exercising the new rules).

6. Tell the user the PR URL (from `gh pr create` output) and ask them to review and merge it. Do NOT merge the PR for them.

## Verification

After execution, print a summary showing:

```bash
gh api repos/<REPO> --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'
gh api repos/<REPO>/rulesets --jq '.[] | {id, name, target, enforcement}'
gh api repos/<REPO>/branches/<BRANCH>/protection --jq '{enforce_admins: .enforce_admins.enabled, allow_force_pushes: .allow_force_pushes.enabled, allow_deletions: .allow_deletions.enabled}'
```

Render a final summary table for the user:

| What | State |
|---|---|
| Merge methods allowed repo-wide | merge + squash |
| PRs → `<BRANCH>` | merge commit only (ruleset `<id>`) |
| PRs → any other branch | squash only (ruleset `<id>`) |
| Direct push / force push / delete on `<BRANCH>` | blocked, admins enforced |

Also provide the URLs for both rulesets so the user can view/edit in the UI:

- `https://github.com/<REPO>/rules/<main-ruleset-id>`
- `https://github.com/<REPO>/rules/<non-main-ruleset-id>`

## Cleanup / rollback

If the user wants to undo everything, provide them with:

```bash
gh api -X DELETE repos/<REPO>/rulesets/<main-ruleset-id>
gh api -X DELETE repos/<REPO>/rulesets/<non-main-ruleset-id>
gh api -X DELETE repos/<REPO>/branches/<BRANCH>/protection/enforce_admins
```

## Rules of engagement

- DO NOT run any `gh api -X POST`, `gh api -X PATCH`, `gh api -X PUT`, or `gh api -X DELETE` before the user confirms the plan.
- DO always show the user the output of each mutating command.
- DO stop and ask for guidance if any command fails (e.g. permission denied, repo not found, ruleset already exists).
- DO NOT touch any branch other than the one the user specified; the `non-<BRANCH>: squash only` ruleset is the only one that affects non-specified branches, and it only restricts the merge method on PRs — it does not block pushes.
- DO NOT disable `allow_rebase_merge` unless the user explicitly asks.
- DO NOT merge the README documentation PR on the user's behalf. Open it and hand over the URL.
- DO NOT reference any specific example repository by name inside the generated README section — the template must be fully generic with only the user's repo and branch names substituted in.
```
