# ~/.agents

A canonical store for coding agent skills, rules, commands, and subagents, organized into profiles. Content lives here. Configured agent runtimes receive compatible artifacts through symlinks created by `ag sync`.

**Built for agents.** The store is run through one command-line tool, `ag`, and `ag` is built mainly for agents. Each store operation is one command that checks the state first. When it refuses, its message names the fix, so an agent follows it instead of improvising git steps. Humans run the same commands: `ag sync` to relink everything, `ag update` to merge changes down, `ag skills add` to install a skill, and `ag push` to push.

**Runtime-neutral invariant:** Cursor and Claude are the runtimes configured today. They are examples, not a supported-agent boundary. Future mappings may target Codex, T3 Code, or any other agent with compatible artifact directories. Keep recipes and store conventions independent of one runtime unless an artifact genuinely uses a runtime-specific feature.

**Current coverage:** Cursor is the primary and fully configured runtime. It receives skills, commands, rules, and subagents. Claude receives skills, commands, and rules, but not subagents. Runtime-neutral design does not mean equal runtime support. See [`docs/runtime-support.md`](./docs/runtime-support.md) for the current gaps and future investigation.

**Edit only this tree.** Do not create or modify artifacts directly in any configured agent home (currently `~/.claude/` and `~/.cursor/`). Those paths are runtime targets. A real file there can block `ag sync`.

## Get started

Your store is your own repository. This repository becomes its Upstream store: you take Core updates from it and never push to it.

Core is read-only in your store, so a Core update never conflicts with your own changes. Your skills, rules, commands, and subagents go in a profile. `ag` refuses edits to Core and names where the change goes instead.

### Before you start

- You need git and Node.js.
- **Windows:** turn on Developer Mode in Settings → System → For developers. `ag sync` links artifacts with symlinks, and Windows creates file symlinks only in Developer Mode. Without it, `ag sync` stops before it changes anything and asks you to turn it on.
- **Optional:** the [GitHub CLI](https://cli.github.com/), signed in with `gh auth login`. With it, `ag init` creates a private repository named `.agents` on your GitHub account. Without it, create an empty repository yourself, with no README or license, and pass its URL to `ag init`.

If you already have a `~/.agents` folder, rename it by hand first, for example to `~/.agents-old`. The skills installer creates that folder, so you may have one already. The store must live in `~/.agents`, and the clone stops when the folder exists. The same applies to `~/.agents-edit`, which `ag` uses as its Edit worktree.

### Step 1: Create your store

**macOS and Linux** (Terminal):

```bash
git clone https://github.com/kkacprzykdev/.agents ~/.agents && node ~/.agents/sync/bin/ag.mjs init
ag new <name>
```

**Windows** (PowerShell):

```powershell
git clone https://github.com/kkacprzykdev/.agents "$HOME\.agents"; node "$HOME\.agents\sync\bin\ag.mjs" init
ag new <name>
```

<details>
<summary>What these commands do</summary>

`ag init` renames the clone's `origin` remote to `upstream` and adds your own repository as `origin`. Then it pushes `main` there, turns on the git hooks, and links the `ag` command with `npm link`. If `npm link` fails, `ag init` prints the full `node` command to use instead. When a step fails, fix the cause and run `ag init` again.

`ag new <name>` creates your first profile and links its artifacts into your agents. `ag update` keeps bringing Core changes from `upstream` down to it. Add `--protect` to `ag new` to keep the profile on this computer only.

</details>

Replace these placeholders:

- `<name>` is the name of your first profile, for example `personal`. It becomes a branch name, so use letters, digits, dots, dashes, or underscores.
- Without the GitHub CLI, add your empty repository's URL after `init`, for example `init https://github.com/<you>/.agents`.

### Step 2: Bring over what you had before

Skip this step when you start with no skills, rules, commands, etc.

- **Third-party skills:** copy the `skills` folder and the `.skill-lock.json` file from your old folder into `~/.agents`. There is no need to install them again.
- **Hand-written skills, rules, commands, etc.:** copy each one into `~/.agents/profiles/<name>/artifacts/<kind>-profile-me/`. `<kind>` is `skills`, `rules`, `commands`, or `subagents`. Give every rule the `.mdc` extension.
- **Artifacts written straight into an agent home**, such as `~/.cursor/rules/`: move them into the same profile folders. Move rather than copy, because a real file left in an agent home can block the link that replaces it.

Then commit in `~/.agents`, run `ag push`, and run `ag sync`.

`ag sync` checks every agent home before it changes anything. A real file or folder with the same name as a store artifact is a Blocker. Sync lists every Blocker and changes nothing until you delete or rename them. Any other real file or folder stays where it is. Sync lists it with the profile folder to move it into.

### Already have a store?

<details>
<summary>Set it up on another computer</summary>

Do this on each extra computer. Rename an existing `~/.agents` folder there first, as above.

**macOS and Linux:**

```bash
git clone <your-store-url> ~/.agents
git -C ~/.agents remote add upstream https://github.com/kkacprzykdev/.agents
cd ~/.agents/sync && npm link
ag use <profile>
ag setup
```

**Windows:**

```powershell
git clone <your-store-url> "$HOME\.agents"
git -C "$HOME\.agents" remote add upstream https://github.com/kkacprzykdev/.agents
cd "$HOME\.agents\sync"; npm link
ag use <profile>
ag setup
```

Replace these placeholders:

- `<your-store-url>` is the URL of your own repository, not this one.
- `<profile>` is the profile to use on this computer.

Git does not clone remotes, so the second line adds this repository as `upstream` again. `ag update` then merges Core updates on this computer too.

`ag setup` names the profile's setup skill. Ask your agent to run that skill. It fills in the profile's local settings. When the profile has no setup skill yet, `ag setup` prints a prompt instead. Give it to an agent to write the skill.

Protected profiles stay on the computer that created them, so you cannot clone them on another one.

</details>

---

## Core and profiles

<details>
<summary>See details</summary>

The `main` branch is the Core branch. It holds Core: the `ag` tool, the git hooks, store artifacts, the runtime mappings, and these docs. It holds no profile, so it is generic and shareable.

Each profile lives on its own branch, named after the profile. A Root profile is created from `main`. Any other profile is created from a Parent profile and keeps receiving its parent's changes by merge. The Lineage is the chain from `main` down to a profile, for example `main` → `default` → `work`. A profile's branch contains the folder of every profile in its Lineage, and `ag sync` links all of their artifacts.

### The `default` profile

`default` is the profile this repository's maintainer uses. It needs tools that are still private, so only the maintainer can use it for now. Create your profiles from `main`, which is what `ag new <name>` does.

</details>

## Layout

<details>
<summary>See details</summary>

```
~/.agents/
├── artifacts/           # store artifacts: skills-, commands-, rules-, subagents-store-me/, linked by every profile
├── docs/                # Core ADRs and runtime support notes
├── sync/                # the ag tool
│   ├── bin/ag.mjs
│   ├── runtimes.yaml    # runtime mappings: agent homes and target folders
│   └── test/            # node:test suite
├── .githooks/           # pre-push (push protection) and pre-commit (runs the ag tests)
├── .github/workflows/   # runs the ag tests on Linux, macOS, and Windows
├── .gitattributes       # Unix line endings in every checkout
│
│   # On profile branches only:
├── profiles/
│   ├── .env.active      # ACTIVE_PROFILE, committed per profile branch
│   └── <name>/          # one folder per profile in the Lineage
│       ├── profile.yaml # parent, runtimes, local-files
│       └── artifacts/   # skills-, commands-, rules-, subagents-profile-me/
├── skills/              # third-party skills (the skills installer writes here)
└── .skill-lock.json     # skills installer metadata (do not edit)
```

The `-me` suffix marks artifacts authored or maintained by hand. Store artifacts are about editing and documenting this store, or running `ag`. They live outside every profile, are committed on `main`, and every profile links them. Third-party skills go in `skills/` only, because the skills installer hardcodes `~/.agents/skills/` for global installs.

A profile may add more files to its folder, such as references, docs, or a `CONTEXT.md` glossary. Those are the profile's own conventions. See the profile's `README.md`.

A profile's own `README.md` lists any extra tools it needs.

</details>

## The `ag` command

<details>
<summary>See details</summary>

```bash
ag help                               # list commands
ag init [<url>]                       # turn a fresh clone into your own store: upstream for Core, origin for your pushes
ag new <name> [--from <parent>] [--protect]
ag use <profile>                      # switch ~/.agents to the profile's branch, then sync
ag sync [--dry-run]                   # recreate symlinks for the Active profile's Lineage
ag status                             # whether Core is read-only, Active profile, Lineage, Edit worktree, protection, stale symlinks
ag setup                              # name the Active profile's setup skill for your agent to run, or print the prompt to create it
ag owner <path>                       # the branch that owns a store path, and where to edit it
ag edit <branch>                      # switch the Edit worktree to a branch
ag push                               # push the branches of ~/.agents and ~/.agents-edit, except local-only ones
ag update                             # fast-forward main from upstream if any, push main if needed, merge each Lineage branch with its parent, then sync
ag skills add <url> [--skill <name>]  # install third-party skills, commit, push, update
ag protect <profile>                  # block pushes that contain the profile's commits
```

Every `ag` command reads `~/.agents` and `~/.agents-edit`, from any directory, so its output does not depend on where it runs. Only `ag owner` uses the current directory, to resolve a relative path.

**Before it changes anything,** every command that switches, merges, commits, or pushes (`new`, `use`, `edit`, `update`, `skills add`) checks both checkouts. When one has uncommitted changes, it prints git's own `git status --short` output for that checkout, then one line, and changes nothing:

```
 M README.md
?? notes.txt
error: ~/.agents-edit has uncommitted changes (listed above). Commit or discard them first.
```

When both checkouts have changes, both blocks are printed, `~/.agents` first. A checkout in the middle of a merge, rebase, cherry-pick, or revert is refused with `error: <checkout> has a merge in progress. Finish or abort it first.` Those commands and `ag push` also refuse when the clone has no `origin` remote: `error: no origin remote. Add it with: git remote add origin <url>`.

**`ag init [<url>]`** sets up a fresh clone, one that has only `main` checked out. It refuses in a store that already has profiles. It renames `origin` to `upstream` and adds `<url>` as `origin`. Without a URL, it creates a private repository with `gh repo create .agents --private`, and refuses with a hint to pass a URL when `gh` is missing or not signed in. Then it pushes `main` to `origin`, sets `core.hooksPath=.githooks`, and runs `npm link` in `sync/`. A failed `npm link` only prints how to run `ag` with `node`. When the push fails, run `ag init <url>` again with the right URL: it keeps `upstream` and replaces `origin`.

**`ag new <name>`** refuses when a checkout is not ready (see above), the name is taken, or the parent branch is missing. It creates the branch from `main`, or from the parent given with `--from`. It writes the profile skeleton: `profile.yaml` and the four `artifacts/<kind>-profile-me/` folders. It writes `profiles/.env.active`, commits, runs `ag protect` when you pass `--protect`, pushes with `ag push`, then runs `ag use` and `ag update`.

With `--from <parent>`, the parent must have a setup skill at `profiles/<parent>/artifacts/skills-profile-me/setup-<parent>/SKILL.md`. Without one, `ag new` creates nothing and prints a prompt to give an agent, which researches the parent and writes the skill. With one, `ag new` copies the parent's local files listed in `profile.yaml` and tells you to run that skill. Your values may already be right, and the skill asks.

**`ag use <profile>`** refuses when a checkout is not ready, and refuses `main`. It creates the local branch from `origin` when it is missing. When the Edit worktree holds the profile's branch, `ag use` moves it to `main`. If `~/.agents` holds `main`, it detaches the Edit worktree instead: the worktree keeps its files and commit, without a branch. Then it switches `~/.agents`, runs `ag sync`, and creates the Edit worktree at `~/.agents-edit` if it is missing. Local files stay on disk across switches.

**`ag sync`** stops on `main`, where there is no Active profile. For each runtime the Active profile uses, it removes the existing symlinks in the target folders, then creates fresh absolute-path symlinks. For each artifact kind, the sources are `skills/` (skills only), then `artifacts/<kind>-store-me`, then each Lineage profile's `artifacts/<kind>-profile-me`, from the top down. Non-symlink files (e.g. `.DS_Store`) are left alone. Hidden entries, `desktop.ini`, and `Thumbs.db` in a source folder are not linked. Missing agent homes and missing source folders are skipped with a warning. If every source for a mapping is missing, that mapping is left untouched. Missing target folders are created. It fails loudly on a name collision between sources, including names that differ only in letter case. Before it changes any runtime, it checks the target folders of every runtime. A real file or folder with the name of a store artifact is a Blocker: sync lists every Blocker it found and changes nothing. Any other real file or folder that is not hidden is an Unmanaged artifact. Sync leaves it alone and lists it with the profile folder to move it into, so the store can manage it. Sync also tries one test link in each target folder first, so a failed sync leaves the old links in place. On Windows, directories are linked as junctions and files as symlinks, which need Developer Mode. Without it, `ag sync` stops with that hint. It also writes every Lineage profile's local files into `.git/info/exclude`, so they stay out of git on every branch. The root `.gitignore` also ignores every `.env*` file except `*.example` templates and `profiles/.env.active`, so env files stay out of git before anyone lists them.

**`ag update`** first writes the Lineage's local files into `.git/info/exclude`, so a file just added to `local-files` does not count as a change. It refuses when a checkout is not ready. When the store has an `upstream` remote, it fast-forwards `main` to `upstream/main` in `~/.agents-edit`. When `main` or `origin/main` has commits that `upstream/main` does not, it stops before it merges or pushes anything. It lists those commits and prints the two commands that reset `main` to `upstream/main`. Those commands drop the listed commits, so copy any change you want to keep into a profile first. When the local `main` has commits that `origin` does not, it pulls and pushes `main` in `~/.agents-edit`, because profiles merge `main` from `origin`. Then, for each branch of the Lineage, from the top down:

1. A branch that can be pushed pulls itself: `git pull origin <branch> --no-rebase`.
2. It merges its parent: `git pull origin <parent> --no-rebase` when the parent can be pushed, which `main` always can, or `git merge <parent>` when the parent is local only.
3. A branch that can be pushed and is ahead of `origin` is pushed.

Ancestors are updated in `~/.agents-edit`. The Active profile's branch is updated last, in `~/.agents`. The Edit worktree is left on `main`, then `ag sync` runs. When every branch is up to date, nothing is committed or pushed. On a conflict, it shows git's own output, then one line naming the checkout and branch, and stops. Resolve the conflict there, commit, and run `ag update` again. It continues where it stopped.

</details>

## Editing the store

<details>
<summary>See details</summary>

Every store path has one owning branch. `ag owner <path>` prints it, with the checkout to edit:

- `profiles/<name>`, and everything in it, belongs to branch `<name>`. A name with no branch is an error.
- Other files directly in `profiles/`, such as `profiles/.env.active`, belong to the Active profile.
- A third-party skill belongs to the highest branch in the Lineage that contains it. A new one, the `skills/` folder itself, and `.skill-lock.json` belong to the Active profile.
- Everything else belongs to `main`.

In a store with an Upstream store, Core is read-only, and `ag status` prints `Core: read-only, from <url>`. `ag owner` refuses every path that belongs to `main`, and `ag edit main` refuses too. `ag push` and `ag update` refuse while `main` has commits that `upstream/main` does not, and print how to reset it. The message of `ag owner` and `ag edit` says where the change goes instead:

- A store-level skill, rule, command, or subagent goes in a profile, under `profiles/<profile>/artifacts/<kind>-profile-me/`.
- A change to `ag`, the docs, or the runtime mappings goes in an issue on the Upstream store.
- To own Core yourself, run `git -C ~/.agents remote remove upstream`. `ag update` then stops taking Core updates.

A store without an `upstream` remote owns its Core. `ag status` prints `Core: owned by this store`, and Core is edited on `main`.

`ag owner` follows symlinks, such as a runtime link under `~/.cursor`, and uses each folder's letter case as it is on disk. It does so even for a file that does not exist yet. When an ancestor has no local branch yet, it checks `origin`'s copy.

The checkout line says `~/.agents` when that checkout holds the owner, `~/.agents-edit (already on <branch>)` when the Edit worktree does, and `~/.agents-edit (run ag edit <branch> first)` otherwise.

Edit the Active profile's branch in `~/.agents`. For any other branch, run `ag edit <branch>` and edit in `~/.agents-edit`. `ag edit` refuses when a checkout is not ready, and pulls the branch from `origin` first when it can be pushed. Then commit, run `ag push`, and run `ag update`. Agents do this after every change, without asking.

To change a third-party skill for every profile, edit it on its owning branch. To change it for one profile only, edit it on that profile's branch. That change stays on the profile's branch, and a later update of the skill on an ancestor can conflict with it.

A plain `git push` also works. The pre-push hook still rejects a branch that carries a Protected profile. Run `ag update` afterwards to bring the change down to the Active profile.

</details>

## Push protection

<details>
<summary>See details</summary>

Push protection is optional, but recommended for any profile that holds private data. Git does not copy local config in a clone, so run it once per clone for each profile:

```bash
ag protect <profile>
```

It sets `core.hooksPath=.githooks`, adds the profile to `ag.noPush` in local git config, and sets `branch.<profile>.pushRemote=no_push`. The committed `pre-push` hook then rejects any push that contains a commit with `profiles/<profile>/`, whatever the branch name. That blocks the profile's branch and every branch created from it. `ag push` and `ag update` use the same test: a branch is local only when any commit that `origin` does not have yet contains a protected profile's folder. `ag push` then prints that the branch is local only and pushes nothing.

`git push --no-verify` skips hooks. Push protection guards against accidents, not intent.

</details>

## Install third-party skills

<details>
<summary>See details</summary>

`ag skills add` runs [Vercel skills](https://github.com/vercel-labs/skills), installing globally to `~/.agents/skills/` with `--agent amp`:

```bash
# a specific skill: npx skills add <url> --skill <name> --yes --agent amp -g
ag skills add https://github.com/anthropics/skills --skill frontend-design

# selected skills from a repo, through the interactive installer: npx skills add <url> --agent amp -g
ag skills add https://github.com/mattpocock/skills
```

It refuses on `main`. It installs into the Active profile's branch, commits, runs `ag push`, then `ag update`. A skill meant for a whole Lineage is installed while the highest profile that needs it is active. When two branches both change `.skill-lock.json`, keep both sets of entries during the merge.

Recent Vercel skills versions do not symlink into agent directories ([#744](https://github.com/vercel-labs/skills/issues/744)). `ag sync` handles that.

</details>

## Configure runtimes

<details>
<summary>See details</summary>

`sync/runtimes.yaml` holds the runtime mappings for every profile:

```yaml
cursor:
  home: ~/.cursor
  targets:
    skills: skills
    commands: commands
    rules: rules
    subagents: agents
claude:
  home: ~/.claude
  targets:
    skills: skills
    commands: commands
    rules: rules
  link-ext:
    rules: .md
```

A kind without a target is not linked into that runtime. `link-ext: .md` gives each file link of that kind the extension, so Claude can load `.mdc` rules. A profile lists the runtimes it uses with `runtimes: [cursor, claude]` in its `profile.yaml`. Without that line it uses all of them. Add a runtime only for artifact kinds whose format and behavior have been verified in it. A mapping alone does not establish full support.

</details>

## Tests

<details>
<summary>See details</summary>

```bash
cd ~/.agents/sync && npm test
```

The suite builds throwaway stores with a local `origin` and a fake home directory. Stubs stand in for `npm`, `npx`, and `gh`, so a test never links packages or creates repositories. The `pre-commit` hook runs it for every commit that changes `sync/` or `.githooks/`, and a failing test blocks the commit. The `ag tests` GitHub Actions workflow runs it on Linux, macOS, and Windows, then runs a git hook from that checkout.

Domain glossary: [`CONTEXT-MAP.md`](./CONTEXT-MAP.md). Decisions: [`docs/adr/`](./docs/adr/). Docs describe the current state only (`artifacts/rules-store-me/store-docs.mdc`).

</details>

## Contributing

<details>
<summary>See details</summary>

Issues are welcome. Pull requests are not accepted for now.

</details>
