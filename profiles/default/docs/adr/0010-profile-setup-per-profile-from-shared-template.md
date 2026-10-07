# Profile setup per profile, from one shared template

Each profile has its own local `.env` with its Profile setup and its own local `.env.outputs` with its Output map. Both are listed under `local-files` in the profile's `profile.yaml`. Both come from shared templates, `profiles/default/.env.example` and `profiles/default/.env.outputs.example`. `ag new --from` copies the parent's two files into a new profile. The `setup-default` skill then shows their values and asks whether they are correct, or creates them after a clone. It only runs when the user starts it.

A single machine-wide `.env` shared by all profiles would remove duplicated values. It is rejected so each profile stays self-contained and can differ from the others. One template per profile would drift, so the templates are shared.
