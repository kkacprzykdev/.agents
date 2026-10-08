# ~/.agents

Link your global setup into every coding agent you use. One store holds it. `ag sync` puts a symlink to each file in each coding agent's global folder.

Many people use several coding agents, because they have different subscriptions. You want one simple workflow in all of them, on every computer. This store gives you that. It works only on your global setup. It never changes a project's own `.cursor/`, `.claude/`, `AGENTS.md`, or `CLAUDE.md`.

## Why use it

### Your setup, everywhere

- Change a skill once, and every coding agent uses it right away. The links are symlinks.
- Get the same setup on every computer. See [Set it up on another computer](#already-have-a-store).
- Use any coding agent. A new one is one entry in `sync/runtimes.yaml`.
- Run it on macOS, Linux, or Windows. You need only git and Node.js. The GitHub CLI is highly recommended.

### Yours to keep

- Keep your global setup in your own GitHub repository, private or public. You never lose it, and git keeps its history.
- Get updates from this repository without merge conflicts. Core is read-only in your store.

### Profiles

- Switch setups with one command: `ag use <profile>`. Try a skill pack such as [mattpocock/skills](https://github.com/mattpocock/skills) or [pstack](https://github.com/cursor/plugins/tree/main/pstack/skills) without mixing it with your own skills.
- Start from nothing. A clean profile links nothing, for benchmarks or simple tests: `ag new clean --clean`.
- Build one profile on another. For example, `work` gets everything from `personal` and adds work skills.
- Keep a profile on your computer. A protected profile never leaves it. Use one for work or private content in a public repository.

### Safe and agent-friendly

- `ag sync` checks everything first. It never deletes your real files. When it stops, it changes no links.
- Your coding agent can manage the store for you.

## Current coverage

- Cursor gets:
  - Skills in `~/.cursor/skills/`
  - Commands in `~/.cursor/commands/`
  - Rules in `~/.cursor/rules/`
  - Subagents in `~/.cursor/agents/`
- Claude gets:
  - Skills in `~/.claude/skills/`
  - Commands in `~/.claude/commands/`
  - Rules in `~/.claude/rules/`
  - `AGENTS.md` and `CLAUDE.md` in `~/.claude/`
- Codex gets:
  - Skills in `~/.codex/skills/`
  - `AGENTS.md` and `CLAUDE.md` in `~/.codex/`

Each coding agent reads the files in a slightly different way. Refer to [`docs/runtime-support.md`](./docs/runtime-support.md).

## Edit only this tree

Do not make or change files in the folders of a coding agent, for example `~/.cursor/` or `~/.claude/`. The `ag sync` command puts links in these folders. A real file in these folders can stop the command.

## Get started

Your store is your own repository. This repository becomes its Upstream store, and `ag init` sets that up. You never push to this repository. `ag push` sends commits to your repository only.

You write your files in a profile. Core stays read-only, so an update from this repository never conflicts with them. When a change belongs somewhere else, `ag` refuses it and says where it goes.

### Before you start

- You need git and Node.js.
- **Windows:** turn on Developer Mode in Settings → System → For developers. `ag sync` links artifacts with symlinks, and Windows creates file symlinks only in Developer Mode. Without it, `ag sync` stops before it changes anything and asks you to turn it on.
- **Highly recommended:** the [GitHub CLI](https://cli.github.com/), signed in with `gh auth login`. With it, `ag init` creates a private repository named `.agents` on your GitHub account. Without it, create an empty repository yourself, with no README or license, and pass its URL to `ag init`.

If you already have a `~/.agents` folder, rename it by hand first, for example to `~/.agents-old`. The skills installer creates that folder, so you may have one already. The store must live in `~/.agents`, and the clone stops when the folder exists. The same applies to `~/.agents-edit`, which `ag` uses as its Edit worktree.

Rename your global `AGENTS.md` and `CLAUDE.md` files too, in the folder of every coding agent you use, for example `~/.claude/CLAUDE.md` to `~/.claude/CLAUDE.md.old`. Your first profile gets its own `AGENTS.md` and `CLAUDE.md`, and `ag new` stops when a real file has one of those names. Step 2 brings the old text over.

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

Do only the items that match what you already have. Every file that `ag sync` links is an artifact: your skills, rules, commands, and subagents (agents), your `AGENTS.md` and `CLAUDE.md`, and third-party skills, installed with [`npx skills`](https://github.com/vercel-labs/skills).

- **Third-party skills:** copy the `skills` folder and the `.skill-lock.json` file from your old folder into `~/.agents`. There is no need to install them again.
- **Artifacts in an agent home**, such as `~/.cursor/rules/`: move them into `~/.agents/profiles/<name>/artifacts/<kind>-profile-me/`. `<kind>` is `skills`, `rules`, `commands`, or `subagents`. Move rather than copy, because a real file left in an agent home can block the link that replaces it.
- **Your old `AGENTS.md` and `CLAUDE.md`:** your profile already has both files, in `~/.agents/profiles/<name>/artifacts/instructions-profile-me/`. Merge the text of your old files, such as `~/.claude/CLAUDE.md.old`, into that `AGENTS.md`. Codex reads `AGENTS.md`. Claude reads `CLAUDE.md`, which imports `AGENTS.md` with its one line, `@~/.claude/AGENTS.md`. Put any lines for Claude only in `CLAUDE.md`, under the import. Then delete the old files.
- **Other artifacts you wrote**, kept anywhere else on your computer: copy each one into the same profile folders. Give every rule the `.mdc` extension.

Then commit in `~/.agents`, run `ag push`, and run `ag sync`.

`ag sync` checks every agent home before it changes anything. A real file or folder with the same name as a store artifact is a Blocker. Sync lists every Blocker and changes nothing until you delete or rename them. For a real `AGENTS.md` or `CLAUDE.md`, it names the `AGENTS.md` to move the text into. Any other real file or folder stays where it is. Sync lists it with the profile folder to move it into.

### Already have a store?

<details>
<summary>Set it up on another computer</summary>

Do this on each extra computer. Rename an existing `~/.agents` folder and the global `AGENTS.md` and `CLAUDE.md` files there first, as above. Then merge the text you want to keep into your profile's `AGENTS.md`, as in Step 2.

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
├── .githooks/           # pre-push (push protection) and pre-commit (read-only Core, runs the ag tests)
├── .github/workflows/   # runs the ag tests on Linux, macOS, and Windows
├── .gitattributes       # Unix line endings in every checkout
│
│   # On profile branches only:
├── profiles/
│   ├── .env.active      # ACTIVE_PROFILE, committed per profile branch
│   └── <name>/          # one folder per profile in the Lineage
│       ├── profile.yaml # parent, clean, local-files
│       └── artifacts/   # skills-, commands-, rules-, subagents-, instructions-profile-me/
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
ag new <name> [--from <parent>] [--protect] [--clean]
                                      # create a profile from main or a parent profile; --clean creates a clean profile from main
ag use <profile>                      # switch ~/.agents to the profile's branch, then sync
ag sync [--dry-run]                   # recreate the symlinks in every coding agent for the Active profile's Lineage
ag status                             # whether Core is read-only, Active profile, Lineage, Edit worktree, protection, stale symlinks
ag setup                              # name the Active profile's setup skill for your agent to run, or print the prompt to create it; a clean profile needs no setup
ag owner <path>                       # the resolved store path, the branch that owns it, and where to edit it
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

**`ag new <name>`** refuses when a checkout is not ready (see above), the name is taken, or the parent branch is missing. It also refuses when a real `AGENTS.md` or `CLAUDE.md` in an agent home has the name of an instruction file that the new profile's Lineage links. It lists those files, says to rename them, and creates nothing. Otherwise it creates the branch from `main`, or from the parent given with `--from`. It writes the profile skeleton: `profile.yaml` and the five `artifacts/<kind>-profile-me/` folders. In a Root profile that is not clean, the instructions folder gets an empty `AGENTS.md` and a `CLAUDE.md` that holds `@~/.claude/AGENTS.md`. It writes `profiles/.env.active`, commits, runs `ag protect` when you pass `--protect`, pushes with `ag push`, then runs `ag use` and `ag update`.

With `--clean`, `ag new` creates a clean profile from `main`. Its `profile.yaml` has `clean: true`. A clean profile links no store artifacts, so one created from `main` links nothing into any coding agent. Use it for benchmarks and simple tests. `--clean` with `--from` is refused. `ag setup` in a clean profile prints that it needs no setup.

With `--from <parent>`, the parent must have a setup skill at `profiles/<parent>/artifacts/skills-profile-me/setup-<parent>/SKILL.md`. Without one, `ag new` creates nothing and prints a prompt to give an agent, which researches the parent and writes the skill. With one, `ag new` copies the parent's local files listed in `profile.yaml` and tells you to run that skill. Your values may already be right, and the skill asks.

**`ag use <profile>`** refuses when a checkout is not ready, and refuses `main`. It creates the local branch from `origin` when it is missing. When the Edit worktree holds the profile's branch, `ag use` moves it to `main`. If `~/.agents` holds `main`, it detaches the Edit worktree instead: the worktree keeps its files and commit, without a branch. Then it switches `~/.agents`, runs `ag sync`, and creates the Edit worktree at `~/.agents-edit` if it is missing. Local files stay on disk across switches.

**`ag sync`** stops on `main`, where there is no Active profile. It also stops on a `profile.yaml` with a `runtimes` line, because every profile links into every coding agent. For each coding agent in `sync/runtimes.yaml`, it removes the existing symlinks in the target folders, then creates fresh absolute-path symlinks. For each artifact kind, the sources are `skills/` (skills only), then `artifacts/<kind>-store-me`, then each Lineage profile's `artifacts/<kind>-profile-me`, from the top down. A clean profile has no `artifacts/<kind>-store-me` source. A coding agent with `reads-store-skills: true` has no `skills/` source. The `instructions` kind has only the profile sources, and each of those folders may hold only `AGENTS.md` and `CLAUDE.md`. Its target is the agent home itself, where sync touches only those two names, in any letter case. Every other file and symlink in the agent home stays as it is. Non-symlink files (e.g. `.DS_Store`) are left alone. Sync links only entries that git tracks on the current branch. Hidden entries, `desktop.ini`, and `Thumbs.db` in a source folder are not linked either. Sync names each untracked entry it skips, so it can be committed. A branch switch can leave a folder behind when it holds only ignored files, such as `.DS_Store`. Sync names those folders too, because a coding agent that reads `skills/` itself still sees them until they are deleted. Missing agent homes and missing source folders are skipped with a warning. If every source for a mapping is missing, that mapping is left untouched. Missing target folders are created. It fails loudly on a name collision between sources, including names that differ only in letter case. Before it changes any coding agent, it checks the target folders of every coding agent. A real file or folder with the name of a store artifact is a Blocker: sync lists every Blocker it found and changes nothing. For a Blocker named `AGENTS.md` or `CLAUDE.md`, it names the `AGENTS.md` to move the text into, because an instructions folder accepts no other file name. Any other real file or folder that is not hidden is an Unmanaged artifact. Sync leaves it alone and lists it with the profile folder to move it into, so the store can manage it. Sync also tries one test link in each target folder first, so a failed sync leaves the old links in place. On Windows, directories are linked as junctions and files as symlinks, which need Developer Mode. Without it, `ag sync` stops with that hint. It also writes every Lineage profile's local files into `.git/info/exclude`, so they stay out of git on every branch. The root `.gitignore` also ignores every `.env*` file except `*.example` templates and `profiles/.env.active`, so env files stay out of git before anyone lists them.

**`ag update`** first writes the Lineage's local files into `.git/info/exclude`, so a file just added to `local-files` does not count as a change. It refuses when a checkout is not ready. When the store has an `upstream` remote, it fast-forwards `main` to `upstream/main` in `~/.agents-edit`. When `main` or `origin/main` has commits that `upstream/main` does not, it stops before it merges or pushes anything. It lists those commits and prints the two commands that reset `main` to `upstream/main`. Those commands drop the listed commits, so copy any change you want to keep into a profile first. When the local `main` has commits that `origin` does not, it pulls and pushes `main` in `~/.agents-edit`, because profiles merge `main` from `origin`. When `sync/bin/ag.mjs` on `main` differs from the running `ag`, the update starts that file in a new process and lets it finish. The process that started the update keeps its old code, so it would not understand a new artifact kind or a new coding agent. Then, for each branch of the Lineage, from the top down:

1. A branch that can be pushed pulls itself: `git pull origin <branch> --no-rebase`.
2. It merges its parent: `git pull origin <parent> --no-rebase` when the parent can be pushed, which `main` always can, or `git merge <parent>` when the parent is local only.
3. A branch that can be pushed and is ahead of `origin` is pushed.

Ancestors are updated in `~/.agents-edit`. The Active profile's branch is updated last, in `~/.agents`. The Edit worktree is left on `main`, then `ag sync` runs. When every branch is up to date, nothing is committed or pushed. On a conflict, it shows git's own output, then one line naming the checkout and branch, and stops. Resolve the conflict there, commit, and run `ag update` again. It continues where it stopped.

</details>

## Editing the store

<details>
<summary>See details</summary>

Every store path has one owning branch. `ag owner <path>` prints the store path it resolved, the owning branch, and the checkout to edit. A relative path is resolved from the current directory, so `profiles/default` typed in `~/.agents/sync` is `sync/profiles/default`, which belongs to `main`. The owning branch is decided like this:

- `profiles/<name>`, and everything in it, belongs to branch `<name>`. A name with no branch is an error.
- Other files directly in `profiles/`, such as `profiles/.env.active`, belong to the Active profile.
- A third-party skill belongs to the highest branch in the Lineage that contains it. A new one, the `skills/` folder itself, and `.skill-lock.json` belong to the Active profile.
- Everything else belongs to `main`.

In a store with an Upstream store, Core is read-only, and `ag status` prints `Core: read-only, from <url>`. `ag owner` refuses every path that belongs to `main`, and `ag edit main` refuses too. `ag push` and `ag update` refuse while `main` has commits that `upstream/main` does not, and print how to reset it. The `pre-commit` hook rejects a raw `git commit` on `main`, and a commit on any other branch that stages a file outside `profiles/`, `skills/`, and `.skill-lock.json`. A commit that concludes a merge passes. The message of `ag owner` and `ag edit` says where the change goes instead:

- A profile artifact goes in a profile, under `profiles/<profile>/artifacts/<kind>-profile-me/`.
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

`sync/runtimes.yaml` holds the runtime mappings. Every profile links into every coding agent listed there:

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
    instructions: .
  link-ext:
    rules: .md
codex:
  home: ~/.codex
  reads-store-skills: true
  targets:
    skills: skills
    instructions: .
```

A kind without a target is not linked into that coding agent. `link-ext: .md` gives each file link of that kind the extension, so Claude can load `.mdc` rules.

`instructions: .` links the Global instructions files, `AGENTS.md` and `CLAUDE.md`, into the agent home itself. There `ag sync` manages only those two names. It never removes or lists any other file or symlink in the agent home.

`reads-store-skills: true` marks a coding agent that reads `~/.agents/skills/` on its own. Codex does, so `ag sync` does not link third-party skills into `~/.codex/skills/`. A link there would show each skill twice. Store and profile skills are still linked.

Add a kind to a coding agent only after its format and behavior have been verified there. See [`docs/runtime-support.md`](./docs/runtime-support.md).

</details>

## Tests

<details>
<summary>See details</summary>

```bash
cd ~/.agents/sync && npm test
```

The suite builds throwaway stores with a local `origin` and a fake home directory. Stubs stand in for `npm`, `npx`, and `gh`, so a test never links packages or creates repositories. The `pre-commit` hook runs it for every commit that changes `sync/` or `.githooks/`, and a failing test blocks the commit. The `ag tests` GitHub Actions workflow runs it on Linux, macOS, and Windows, then runs a git hook from that checkout. The workflow runs only in this repository. In your own store's repository its job is skipped, so it uses none of your Actions minutes.

Domain glossary: [`CONTEXT-MAP.md`](./CONTEXT-MAP.md). Decisions: [`docs/adr/`](./docs/adr/). Docs describe the current state only (`artifacts/rules-store-me/store-docs.mdc`).

</details>

## Contributing

<details>
<summary>See details</summary>

Issues are welcome. Pull requests are not accepted for now.

</details>
