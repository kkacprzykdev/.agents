# Profiles live on branches below the Core branch

The `main` branch is the Core branch. It holds Core: the `ag` tool, the git hooks, store artifacts, the runtime mappings, and the store docs. It holds no profile, no third-party skills, and no personal values, URLs, or tool dependencies, so it can be shared. It is the repository's default branch, so a fresh clone starts with no Active profile.

Each profile lives on its own branch, named after the profile. A Root profile's branch is created from `main`. Any other profile's branch is created from its Parent profile's branch (ADR 0017). A child keeps receiving its parent's changes by merge (ADR 0019). Everything a profile owns is committed on its branch. Only the profile's local files stay out of git.

Every profile's artifacts have history. Checking out a branch physically removes every profile outside its Lineage, so agents cannot pick up another profile's data by accident.

## Considered Options

- **One branch, with profiles gitignored:** profile artifacts would have no history. Gitignore lines would have to match a marker on each artifact, which gives two sources of truth that are easy to get wrong.
- **One repository per profile:** full isolation, but Core changes would need copying between repositories instead of a merge.
- **One profile's branch as the base of every other profile:** every new profile would carry that profile's content and workflow. A Core branch lets a new profile start clean, or from any profile it chooses.

## Consequences

Core changes happen on `main` and reach profiles only through merges. Maintenance is a little heavier, which is accepted in exchange for isolation. `ag update` does the merges.
