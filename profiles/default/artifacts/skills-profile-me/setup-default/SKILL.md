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

The templates are the source of truth for keys. Key order in a template is the order to ask in. The comment line above each key gives its meaning and format. The value in the template is an example, or the recommended value for the Output map.

`ag new --from` may have copied these files from the parent profile, so they may already hold correct values. Never change a value without the user's answer. Never change `profiles/.env.active`. That file is committed on each profile branch, and `ag use <profile>` switches it.

`default` is a Root profile, so there is no parent setup skill to run first.

## Steps

### Active profile

1. Read `ACTIVE_PROFILE` from `~/.agents/profiles/.env.active`. If the file or the key is missing, stop and tell the user the checkout has no Active profile.
2. Tell the user which profile is being set up. If they want a different profile, tell them to run `ag use <profile>` first and stop.

### Profile setup (`profiles/<name>/.env`)

3. **If the file exists:** show every key from `.env.example` with its current value, and mark keys that are missing. Ask in **one** message whether the values are correct. If the user says yes, keep the file. Otherwise ask, one key per message, for each value the user wants to change and for each missing key.
4. **If the file is missing:** for each key in `.env.example`, in template order, ask for its value in **one** message per key. Name the key, and show its meaning, format, and example value. Ask the user to reply with the value only.
5. Accept a reply only when it is a single non-empty line that matches the format. Otherwise show the format and example value again and wait. The user's reply is the only source of a value.
6. Write `KEY=value` lines to `profiles/<name>/.env` right away. Create the file on the first write. Keep keys the template does not list. Do not copy the template comments.

### Output map (`profiles/<name>/.env.outputs`)

7. **If the file exists:** show its lines. Ask in **one** message whether they are correct. If the user says yes, keep the file. Otherwise continue with step 8, and show the current lines next to the recommended ones.
8. **If the file is missing, or the user wants changes,** say in **one** message:
   - The Output map tells agents where to write generated artifacts (summaries, work states, and similar files). Each key is an artifact kind and its value is a directory.
   - Explain each key from its template comment. Say clearly that `fallback` is **mandatory**. Every kind without its own line uses it. All other keys are optional.
   - The user can add a line for any other kind to store those files somewhere other than `fallback`.
   - Show the recommended setup: the key lines of `.env.outputs.example`, without comments.
   - Ask whether to use the recommended setup. If not, ask the user to reply with the `kind=directory` lines they want.
9. If the user agrees, use the recommended lines. Otherwise use the user's lines. Accept them only when every line is `kind=directory` with a non-empty, unquoted value and one line is `fallback`. A value may start with `~`. Otherwise explain what is wrong and wait.
10. Write the lines to `profiles/<name>/.env.outputs`. Do not copy the template comments.

### Local files

11. Read `profiles/<name>/profile.yaml`. `local-files` must list `.env`, `.env.outputs`, and every other file in `profiles/<name>/` that is not committed, except `.DS_Store`. Find those files with `git -C ~/.agents status --short --ignored -- profiles/<name>/`.
12. If an entry is missing, add it to the inline list, commit `profile.yaml`, then run `ag push` and `ag update`, as `edit-agents-store.mdc` describes. `ag update` writes the new entry into `.git/info/exclude` before anything else, so git ignores the file on every branch.

### Finish

13. Show the final contents of every file this run created or changed. If every file was already correct, say that no extra setup is required.
