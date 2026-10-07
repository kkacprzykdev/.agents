# The `default` profile

A Root profile created from `main`. It adds a general workflow on top of Core: references, the Profile setup, the Output map, third-party skills, and the profile artifacts in `artifacts/`. Profiles created from it with `ag new <name> --from default` receive all of it, and keep receiving its changes through `ag update`.

Its glossary is [`CONTEXT.md`](./CONTEXT.md). Its decisions are in [`docs/adr/`](./docs/adr/). How its artifacts behave in each runtime is in [`docs/runtime-support.md`](./docs/runtime-support.md).

It is set up and used on macOS. It has not been prepared for other machines yet: its templates use macOS paths, and some skills assume `brew` and `zsh`.

## Layout

```
profiles/default/
  profile.yaml          # parent: main, local-files
  .env                  # Profile setup; local file
  .env.outputs          # Output map; local file
  .env.example          # tracked template for the .env of every profile in this Lineage
  .env.outputs.example  # tracked template for every .env.outputs
  artifacts/
    skills-profile-me/  # includes setup-default
    commands-profile-me/
    rules-profile-me/   # includes profile-references.mdc, the References rule
    subagents-profile-me/
  references/
    shared.md           # optional shared reference
    <artifact>.md       # optional named reference
  docs/
    adr/
    runtime-support.md  # how this profile's artifacts behave in each runtime
```

A profile created from `default` has its own `.env`, `.env.outputs`, and `references/`. `ag new --from default` copies the two local files. It does not copy the references.

## Tools

Some skills need these clones. The paths are recorded in the Profile setup.

```bash
git clone https://github.com/kkacprzykdev/chatpicker.git ~/projects/chatpicker
git clone https://github.com/kkacprzykdev/treestatus.git ~/projects/treestatus
(cd ~/projects/treestatus && npm install && npm run build && npm link)
```

The chatpicker clone provides the session resolver that the `resolve-agent-sessions` skill runs. The TreeStatus clone provides the `treestatus` command that the `find-free-checkout` skill runs. The skill also reads its `CONTEXT.md` glossary. You can clone either somewhere else, and enter those paths during setup.

## Setup

Run the `setup-default` skill in an agent chat, or run `ag setup` to see which skill to run. Agents do not start it on their own. Run it after cloning, after `ag use` on a profile that is new on this machine, and after `ag new --from default`. It shows the values already in place and asks whether they are correct.

To set up by hand, copy `.env.example` to `profiles/<name>/.env` and `.env.outputs.example` to `profiles/<name>/.env.outputs`, then fill them in. `fallback` is the only mandatory Output map key.

Local files stay on disk when you switch branches, so each profile is set up once per machine.

## References

A reference resolves along the Lineage. The Active profile's file wins, then its parent's, up to `default`, then the artifact's generic behavior. A profile adds a reference only when it needs something different. The always-on rule `profile-references.mdc` is the load protocol. `ag sync` links artifacts, never references.
