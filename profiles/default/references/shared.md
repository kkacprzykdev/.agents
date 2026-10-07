# Default profile — shared references

Artifacts read this file when the Active profile is `default`, and on other profiles when they have no `shared.md` of their own. If a section is absent, use the generic behavior in the artifact.

Profile setup values (home, chatpicker, TreeStatus source) are not references. They live in the profile `.env` (`profile-references.mdc`).

## Ticket URLs

No ticket base URL. Use a URL the user pasted, or omit the ticket line.

## PR template

```markdown
### Motivation
### Proposed changes
```

## PR description generator

`~/.agents/profiles/default/artifacts/skills-profile-me/gen-pr-desc/SKILL.md`
