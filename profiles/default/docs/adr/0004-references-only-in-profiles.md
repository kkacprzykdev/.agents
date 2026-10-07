# Environment-specific values live only in profile references

Environment-specific values, such as URLs, templates, vault paths, and product hosts, live in profile references. They never live in a skill, command, rule, or subagent. An artifact may ship generic supporting files beside it, but none of them hold environment-specific values. Machine-local values are not references. They live in each profile's Profile setup (ADR 0010).

The References rule, `profile-references.mdc`, is an always-on rule in `default`. It governs every profile in the Lineage, `default` included. A rule for workplace values only would leave the generic references ungoverned. Values kept beside an artifact could not differ between profiles, because every profile that links the artifact gets the same files.

The mechanism lives in `default`, not in Core, because only this Lineage uses it. If most profiles come to need it, the rule and these ADRs move to `main`.
