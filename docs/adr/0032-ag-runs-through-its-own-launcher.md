# ag runs through its own Launcher

`ag` reaches `PATH` through its own Launcher: a small file in a user folder on `PATH` that runs the Sync tool with whichever `node` comes first on `PATH`. There is one per computer, so `ag` keeps working after every Node switch, with nvm, Homebrew Node, or the Windows Node installer.

| System | Launcher files |
|---|---|
| macOS, Linux | `~/.local/bin/ag`, a shell script that runs `exec node "<store>/sync/bin/ag.mjs" "$@"` |
| Windows | `%USERPROFILE%\.local\bin\ag.cmd` for PowerShell and cmd, plus the same shell script as `ag` for Git Bash |

- **Store path:** `<store>` is the absolute path of the main checkout, found the way `ag` finds it from its own file. A shell with a different `HOME`, and an `ag` run from the Edit worktree or a Core change worktree, still act on the main checkout.
- **`node`:** the Launcher looks `node` up on `PATH` each time it runs. It saves no path from install time.
- **Who writes it:** `ag init`, and every command that syncs. Each one writes a missing Launcher and rewrites one an older `ag` wrote, so every computer gets it at its next `ag update`. It is a small step beside Sync, not part of the Global setup (ADR 0025).
- **Marker:** the line `# ag launcher`, or `@rem ag launcher` in `ag.cmd`, marks a Launcher. `ag` rewrites any marked file to the current text, and keeps its target.
- **A file in the way:** a link from the Launcher's path into the store's `sync/bin/`, made by hand before the Launcher, is replaced by a Launcher with the same target. Any other file there stays, and `ag` names it, like a Blocker.
- **Never in the way:** a Launcher that cannot be written, a folder missing from `PATH`, and another `ag` on `PATH` each give a warning. None of them stops a command, and Sync still links the Global setup. `--dry-run` only reports.
- **`PATH` on macOS and Linux:** while the folder is missing from `PATH`, every command that writes the Launcher, and `ag status`, prints the line to add and the startup file for the user's shell: `~/.zshrc` for zsh, `~/.bash_profile` for bash, and `fish_add_path ~/.local/bin` for fish. `ag` never edits a startup file.
- **`PATH` on Windows:** `ag` adds the folder to the user `PATH` itself through PowerShell's `[Environment]::SetEnvironmentVariable`, reading and writing only the user value. An open terminal needs a restart to see it.
- **Other `ag` commands:** `ag` checks the folders on `PATH`. It always warns about an `ag` that runs this store's `ag` outside the Launcher, such as an old npm link, and gives `npm rm -g ag`. It warns about a foreign `ag`, such as The Silver Searcher, only when it comes before the Launcher, and about another `ag` command in the Launcher's own folder, which Windows can pick over `ag.cmd`. It deletes none of them.
- **`ag status`** reports the Launcher, whether its folder is on `PATH`, and the warnings.

The package in `sync/` has no `bin` entry, so `npm link` cannot create a second `ag`.

## Considered Options

- **`npm link`** (issue): the link lives in one Node version's global folder, so `ag` is "command not found" after `nvm use` to another version. A computer can end up with two `ag` commands, where the order of `PATH` decides which one runs. A failed link only warns, and leaves the user to type the full `node` command every time.
- **A shell alias or function** (issue): it needs an edit to each shell's startup file, and agent shells and GUI apps that read no startup file never see it.
- **Volta or a similar tool manager** (issue): one more tool to install on every computer, for one command.
- **One compiled binary** (issue): a build and a release for each system, for a tool that is a single Node script with no dependencies.
- **A `node` path saved at install time** (issue): it breaks when that Node version is removed. pipx saves its interpreter path, and breaks the same way.
- **Editing shell startup files** (issue; uv, rustup, Deno, Bun, Volta, and pnpm do it): most installers do it, but `ag` would then write into the user's own text. Printing the line keeps the file theirs.
- **`ag.ps1` on Windows** (issue; npm cmd-shim writes one): a PowerShell execution policy can block it. `ag.cmd` runs in PowerShell and cmd without one.
- **`setx` on Windows** (Volta uses it): it cuts a long `PATH` short, and copies the merged process `PATH`, system part included, into the user value.
