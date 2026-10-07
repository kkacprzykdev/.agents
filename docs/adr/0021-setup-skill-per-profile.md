# Each parent profile has a setup skill

A profile that other profiles are created from has a setup skill at `profiles/<name>/artifacts/skills-profile-me/setup-<name>/SKILL.md`. It configures a profile created from `<name>`, and `<name>` itself on a new machine. It may run its parent's setup skill first.

`ag` checks for the skill in one profile only, and never runs it, because setup needs a human and an agent:

- `ag new <child> --from <parent>` checks the parent. When the skill is missing, `ag new` creates nothing, prints a fixed prompt for an agent, and fails. When the skill exists, `ag new` creates the child and tells the human to run it.
- `ag setup` checks the Active profile. It names the skill, or prints the same prompt.

`ag new` without `--from` creates a profile from `main`, which has no setup skill.

## The setup skill standard

The prompt asks an agent to research the profile and write a skill that:

- configures everything a child of the profile needs
- shows the current value of each file `ag new` already copied, and asks the human whether it is correct
- checks, on every run, that `local-files` in `profile.yaml` lists every local file the profile uses, and runs `ag sync` after it changes the list
- says that no extra setup is required, when nothing needs configuring

## Considered Options

- **A generated placeholder skill:** a child would get a skill that configures nothing, and nobody would notice it was missing.
- **One generic setup skill in Core:** it would have to know every profile's conventions, which Core never names.
- **Checking every ancestor:** a missing skill high in the Lineage would block profiles that do not need it.
