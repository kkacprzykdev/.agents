# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## How issues arrive

- An issue from anyone other than the repository owner or a collaborator gets `needs-triage` from `.github/workflows/triage-label.yml`.
- The owner's own issues skip that label. The owner sets the state when filing, or runs `/triage` on it.
- `/to-spec` and `/to-tickets` issues are the owner's, so they keep only `ready-for-agent`.
- The issue forms set the category: `bug` or `enhancement`. `ag issue` sets it only for someone with push access. Otherwise triage sets it.
