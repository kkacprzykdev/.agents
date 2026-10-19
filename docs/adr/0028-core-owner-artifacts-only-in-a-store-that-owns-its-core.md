# Core-owner artifacts are linked only in a store that owns its Core

Some Store artifacts serve only the owner of Core, such as the commands and the rule of the Core change workflow. A user whose store takes Core read-only from an Upstream store can never use them. They live in `artifacts/<kind>-core-me/`, next to `artifacts/<kind>-store-me/`, for skills, commands, rules, and subagents. Location decides, as in ADR 0014: every artifact in such a folder is a Core-owner artifact, and nothing else marks it.

In the Link mapping, the Core-owner folder of a kind is a source right after that kind's Store artifact folder. `ag sync` uses it only when the store has no `upstream` remote (ADR 0023) and the profile is not a Clean profile. A name in both folders of one kind is a Collision, like any two sources. `ag status` checks the same link plan.

In a store with an `upstream` remote, `ag sync` never lists the source, so its usual clear-and-recreate removes links from an earlier sync. `ag owner` refuses a Core-owner artifact path like any Core path, and names the matching profile folder, as it does for a Store artifact.

## Considered Options

- **A frontmatter field:** every artifact kind keeps its frontmatter in a different place.
- **A name list in `ag`:** every new Core-owner artifact needs a code change.
- **A check inside each command:** every user still sees the commands.
- **Profile artifacts in the Core owner's Root profile:** they would not ship with Core.
- **Project files in the store repository:** they bypass the runtime mappings, and Codex reads only `.agents/skills/`.
