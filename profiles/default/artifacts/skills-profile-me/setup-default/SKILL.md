---
name: setup-default
description: >-
  Configures the default profile, or a profile created from it: the .env
  (Profile setup), the .env.outputs (Output map), and the local-files list in
  profile.yaml. Shows existing values and asks whether they are correct. Use
  after cloning ~/.agents, after ag new --from default, after switching to a
  profile for the first time on this machine, or when ag setup names it.
disable-model-invocation: true
---

# Set up a profile from `default`

The profile being set up is the Active profile. Its local files and their tracked templates:

| File | Holds | Template |
|---|---|---|
| `profiles/<name>/.env` | Profile setup | `profiles/default/.env.example` |
| `profiles/<name>/.env.outputs` | Output map | `profiles/default/.env.outputs.example` |

The templates are the source of truth for keys. Key order in a template is the order to handle them in. The comment line above each key gives its meaning and format, and tags how the value is found:

- **Detected:** the agent sets it, never the user. Run this command once; it prints `HOME_PATH`, then `HOME_FILE_URI`, correct on macOS, Linux, and Windows (`ag` already requires Node):
  ```
  node -e "const os=require('os'),url=require('url');console.log(os.homedir());console.log(url.pathToFileURL(os.homedir()).href)"
  ```
- **Clone of `<url>`:** the user clones the repository, then gives the path to its root.
- **Untagged:** the user gives the value.

Values in `.env.example` are empty. Values in `.env.outputs.example` are the recommended Output map.

`ag new --from` may have copied these files from the parent profile, so they may already hold correct values. Never change a user-given value without the user's answer. Never change `profiles/.env.active`. That file is committed on each profile branch, and `ag use <profile>` switches it.

`default` is a Root profile, so there is no parent setup skill to run first.

## Messages

Keep every message terse: the question, plus only what the user needs to answer it. One question per message, unless a step says otherwise. Show a format only after a reply fails to match it.

## Steps

### Active profile

1. Read `ACTIVE_PROFILE` from `~/.agents/profiles/.env.active`. If the file or the key is missing, stop and tell the user the checkout has no Active profile.
2. Name the profile being set up in one line, inside the first question. If the user wants a different profile, tell them to run `ag use <profile>` first and stop.

### Profile setup (`profiles/<name>/.env`)

3. Run the detection command and write the **Detected** keys to `profiles/<name>/.env`. Create the file if it is missing. Report the values in one line, inside the next message.
4. **If the file already held user-given keys:** show those keys with their values in **one** message and ask whether they are correct. If yes, keep them. Otherwise handle each key the user wants to change, as in step 5.
5. **For each user-given key that is missing**, in template order:
   - **Clone of `<url>`:** first message: ask the user to clone `<url>`, showing that repository's commands from the `## Tools` section of `profiles/default/README.md`, and to reply when done. Second message: ask for the absolute path to the clone root. Accept it only when `git -C <path> rev-parse --show-toplevel` prints that same directory.
   - **Untagged:** ask for the value in one message, naming the key and its meaning.
6. Accept a reply only when it is a single non-empty line that matches the format. Otherwise show the format and wait. The user's reply is the only source of a user-given value.
7. Write each `KEY=value` line to `profiles/<name>/.env` right away. Keep keys the template does not list. Do not copy the template comments.

### Output map (`profiles/<name>/.env.outputs`)

8. **If the file exists:** show its lines and ask whether they are correct. If yes, keep the file. Otherwise continue with step 9.
9. **If the file is missing, or the user wants changes,** send **one** message: one line saying the Output map sets the directory where agents write each kind of generated file, then the recommended lines (the key lines of `.env.outputs.example`, without comments) with a short note per key from its template comment. Mark `fallback` as **mandatory**: every kind without its own line uses it. Ask whether to use these lines, or to reply with their own `kind=directory` lines. When the file existed, show its current lines beside the recommended ones.
10. Accept the user's lines only when every line is `kind=directory` with a non-empty, unquoted value and one line is `fallback`. A value may start with `~`. Otherwise say what is wrong and wait.
11. Write the lines to `profiles/<name>/.env.outputs`. Do not copy the template comments.

### Local files

12. Read `profiles/<name>/profile.yaml`. `local-files` must list `.env`, `.env.outputs`, and every other file in `profiles/<name>/` that is not committed, except `.DS_Store`. Find those files with `git -C ~/.agents status --short --ignored -- profiles/<name>/`.
13. If an entry is missing, add it to the inline list, commit `profile.yaml`, then run `ag push` and `ag update`, as `edit-agents-store.mdc` describes. `ag update` writes the new entry into `.git/info/exclude` before anything else, so git ignores the file on every branch.

### Finish

14. Show the final contents of every file this run created or changed. If every file was already correct, say that no extra setup is required.
