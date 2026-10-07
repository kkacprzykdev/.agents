# Next

Ideas and backlog. Short sentences. This file is used until the repository has a ticketing system, most likely GitHub issues.

- Extend Claude support with hooks sync.
- Add `ag import <folder>`. It brings an existing `~/.agents` folder into a profile: third-party skills with their lock entries, and hand-written skills, rules, and commands. Then it commits, pushes, and syncs.
- `ag setup` checks only the Active profile. A profile without its own setup skill, such as one created from `default`, gets the "create a setup skill" prompt, even though its parent's skill could configure it. Decide whether `ag setup` should fall back to the nearest setup skill in the Lineage. ADR 0021 considers and rejects checking every ancestor for `ag new`.
- Idea only, not planned: let a profile override parts of Core, such as adding its own runtime mapping. A store with an Upstream store then would not need an issue upstream for a new runtime.
- Phase two of the public release: let others create profiles from `default`.
  - Make `treestatus` and `chatpicker` public and ready for other machines, Windows included.
  - Let `ag` create a profile from a profile of the Upstream store. `ag new --from <profile>` finds the branch on `upstream`. `ag update` merges `upstream/<profile>` into the user's copy of that branch.
  - Make the user's copy of an Upstream store profile read-only, like Core. Edits to it would conflict with later changes from the Upstream store.
  - Make the `default` setup work on Windows: paths in `.env.example`, and skills that assume `brew` or `zsh`.
  - Check `default` for personal or workplace values before others build on it.
  - Document `ag new --from default` in the README as a supported path.
