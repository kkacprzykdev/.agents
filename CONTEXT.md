# Agent store

The canonical store of agent artifacts, organized into named profiles on branches below one Core branch. Recipes stay in skills, commands, rules, and subagents. A profile's own conventions, such as references, are described in its folder.

## Language

### Core and profiles

**Core**:
Everything on the Core branch: the `ag` tool, the git hooks, store artifacts, the runtime mappings, and the store docs. It holds no profile and no personal values.
_Avoid_: Base, base files, trunk

**Core branch**:
`main`, the branch every profile starts from, directly or through its ancestors. It is the repository's default branch.
_Avoid_: Base branch, Default profile, default branch (for the profile)

**Upstream store**:
The store a user's own store was cloned from. The user's Core branch fast-forwards to its Core branch. The user reads it and never pushes to it. In a store with an Upstream store, Core is read-only: only `ag update` changes its Core branch. A store that was not cloned from another one has no Upstream store and owns its Core.
_Avoid_: upstream (alone), fork, template, parent store, maintainer, consumer

**Profile**:
A named environment: its profile artifacts, its `profile.yaml`, and whatever else its folder holds. Each profile is carried by its own Profile branch.
_Avoid_: Pack, context, overlay, defaults flag

**Root profile**:
A profile created from the Core branch. `default` is one.
_Avoid_: Base profile, Default profile

**Parent profile**:
The one profile a profile was created from. The child keeps receiving the parent's changes by merge.
_Avoid_: Base profile, upstream

**Lineage**:
The ordered chain from the Core branch down to a profile, for example `main` → `default` → `work`. Each profile names its parent in its `profile.yaml`.
_Avoid_: Inheritance chain, stack

**Profile branch**:
The git branch that carries one profile, named after it. It also carries the folder of every ancestor in its Lineage.
_Avoid_: Pack branch, environment branch

**Profile skeleton**:
What `ag new` always writes for a new profile: `profile.yaml` and the five `artifacts/<kind>-profile-me/` folders. Everything else in a profile folder is added later, only to extend the Lineage.
_Avoid_: Profile template, copying the parent's folder

**Clean profile**:
A Root profile with `clean: true` in its `profile.yaml`. It links no store artifacts. Created from the Core branch, it links nothing into any coding agent. It is for benchmarks and simple tests. `ag new <name> --clean` creates one.
_Avoid_: Empty profile, bare profile, blank profile

**Active profile**:
The one profile in force in a checkout. Each Profile branch commits its own Active profile value, so checking out a branch switches the Active profile. The Core branch has none.
_Avoid_: Deriving it from the branch name, a hand-set gitignored selector

**Protected profile**:
A profile whose commits must never leave the machine. A push that contains any of its commits is rejected, whatever the branch name. Every profile created from it is protected too. Protection is opted into once per clone, profile by profile.
_Avoid_: Private profile, local-only profile, no-push branch

**Local files**:
A profile's files that are never committed, such as machine-local settings. Its `profile.yaml` lists them under `local-files`. `ag new --from` copies the parent's local files into the child, and `ag sync` keeps them out of git on every branch.
_Avoid_: Env files, machine setup, secrets

**Setup skill**:
The skill `setup-<profile>` inside a profile. It configures a profile created from that profile, or the profile itself on a new machine. A profile needs one before another profile can be created from it.
_Avoid_: setup-profile, a generated placeholder skill

### Artifacts

**Profile artifact**:
A skill, command, rule, subagent, or Global instructions file that lives inside one profile. Every profile in that profile's Lineage below it links it too.
_Avoid_: Local-only artifact, private skill, personal artifact directories at the store root

**Global instructions file**:
A profile's `AGENTS.md` or `CLAUDE.md`, in its `artifacts/instructions-profile-me/` folder. `ag sync` links it into the Agent home of Claude and Codex. Only one profile in a Lineage can have each file.
_Avoid_: Memory file, global rule, context file

**Store artifact**:
A hand-authored artifact about the store itself: editing it, documenting it, or running `ag`. It lives outside every profile, is committed on the Core branch, and every profile links it.
_Avoid_: Repo-local rule, putting store maintenance artifacts in a profile

**Third-party skill**:
A skill installed by a skills installer. It lives at the store root, outside every profile, because the installer writes to a fixed location. It belongs to the highest branch in the Lineage that contains it. It never exists on the Core branch.
_Avoid_: Vendor skill, external artifact
