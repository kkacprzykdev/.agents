# Output map is a fallback directory plus optional kind lines

Each profile names one Fallback directory in its vault, under the `fallback` key. Kind lines exist only for generated-artifact kinds that must not use that fallback. A small profile can stay small. A profile with a richer layout can keep it without forcing that layout on every profile.

A required full matrix of kinds would make every profile as complex as the richest one. A single untyped folder with no kinds would mix summaries, work states, and analysis packages in profiles that need them apart. The key is `fallback`, not `default`, because `default` already names a profile.
