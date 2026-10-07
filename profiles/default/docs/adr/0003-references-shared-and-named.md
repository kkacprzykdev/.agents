# References are shared plus optional per-artifact files

Values that several artifacts share live in one shared reference, `references/shared.md`. Values that belong to one artifact live in a named reference, `references/<artifact>.md`. When a profile has no reference for an artifact, it falls back as ADR 0013 describes.

One file for every value would grow without bound. Duplicating shared values in every named reference would drift.
