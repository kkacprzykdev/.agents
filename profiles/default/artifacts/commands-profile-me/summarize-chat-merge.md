---
---

# Merge Multiple Chat Context Summaries

**Storage:** Resolve the Active profile (`profile-references.mdc`). `<chat-context-summary-dir>` is the Output map kind `chat-context-summary`.

Combine **two or more already-compressed summary files** under the Active profile Output map kind `chat-context-summary` into a single merged summary that a future agent can load instead of all sources individually. Useful when a feature spans multiple versions (V0 → V1 → V2) or multiple parallel workstreams whose context the next iteration needs at once.

## When to Use

Use this command when you have:
- Two or more existing `CHAT_CONTEXT_SUMMARY_*` files that describe the **same feature** at different points in time (e.g. V0 + V1) or **closely related features** that the next chat needs as joint context.
- Each source already compressed (run `summarize-chat-compress` on each one first if any are still bloated).
- A plan to start a new chat (e.g. V2) where attaching every individual summary would be wasteful.

Do NOT use this command to:
- Compress a single bloated summary — use `summarize-chat-compress` instead.
- Merge unrelated features — the resulting Architecture / Constraints sections would be incoherent. Keep unrelated features in separate summaries.
- Generate a fresh summary from a chat — use `summarize-chat-new` or `summarize-chat-update` instead.

## Scope: This Command Does NOT Compress

This command is a **structured union with dedupe**, not a compression pass. Inputs are taken as authoritative — if a constraint exists in V0's source, it appears in the merged output. The user is responsible for compressing each input separately (via `summarize-chat-compress`) before invoking this command. Mixing compression into merge would couple two orthogonal concerns and make the output non-deterministic.

The only content the agent removes is **near-duplicate bullets/files/chat-entries** identified by the dedupe rules in Step 3. Nothing is removed because it "felt redundant" or "could be shorter".

### 🛑 CRITICAL: Timestamp & Git State Rules 🛑

1.  **Generation Command:** Execute `TZ='Europe/Warsaw' date '+%Y-%m-%d-%H-%M-UTC%z'` to get the merged file's timestamp.
2.  **Header `Generated`:** Use the timestamp above.
3.  **Header `Feature`:** Mandatory. Ask the user for the merged feature name (see Step 1) — this enables `summarize-chat-update` to later operate on the merged file.
4.  **No `Branch` / `Repository` / `Pull request` / `Transcripts path` in the header.** A merged summary may be loaded into a new chat that hasn't yet started a branch, or that runs in a different worktree from any of the sources; and sources themselves may come from different workspaces (so their `Transcripts path` and `Pull request` values may legitimately differ). Per-source branch, repository, pull request URL, and transcripts path are recorded inside `**Merged from**:` instead — see Step 5 for the per-source entry format.
5.  **Header `Merged from`:** List every source file with its own metadata block — see Step 5 for the exact format.

### Merge Protocol

#### Step 0: Collect Inputs

**The user must provide the source filenames** (or the agent infers them from the user's attached files / current selection). If fewer than 2 sources are provided, stop and ask. If more than 5 sources are provided, ask the user to confirm — merging 6+ summaries usually indicates a different problem (e.g. unrelated features) and the output will be unwieldy.

For each source file:
1. Read the entire file once. Record its header fields (`Generated`, `Feature`, `Branch`, `Repository`, `Pull request`, `Transcripts path`, `Compression mode`).
2. Enumerate all top-level `## ` headings in order of appearance, tagging each as **canonical** (Feature Overview, Background, Architecture & Key Decisions, Constraints & Anti-Patterns, Current Implementation State, Critical Files, Past Chat References) or **non-canonical** (anything else — same rule as in `summarize-chat-compress.md`).
3. Record each non-canonical section's position relative to canonical sections (e.g. "before §1", "between §3 and §4", "after §7").

This inventory is the input to every subsequent step. Keep it as working notes — you'll cross-reference it during dedupe.

#### Step 1: Decide the Merged Feature Name + Filename

Ask the user (via `AskQuestion` or an equivalent structured prompt) for the **merged feature name** that will appear in the filename and `**Feature**:` header. Default suggestion: the longest common prefix across source `**Feature**:` values, with a trailing `-merged` or `-combined` suffix.

Example: V0's feature = `convert-flow-tables`, V1's feature = `convert-flow-tables-v1` → suggested merged name = `convert-flow-tables-merged`.

The merged file path is `<chat-context-summary-dir>/CHAT_CONTEXT_SUMMARY_<new-timestamp>_<merged-feature-name>.md`.

#### Step 2: Build Feature Overview (Verbatim Per-Source Concat)

The Feature Overview in the merged file is a **strict verbatim concatenation** of each source's `## 1. Feature Overview` body, in **chronological order by source `Generated` timestamp (oldest first)**. Do NOT ask the user how to merge — there is no choice. Do NOT rewrite, paraphrase, or unify Motivations across sources. Each block must be copy-pasteable back into its original PR description unchanged. This command does **not** load the artifact path in Active profile references/shared.md **PR description generator** to rewrite Feature Overview. Sources already contain it.

For each source, in oldest-to-newest order:

1. Emit a sub-heading identifying the source. Format: `### From [source-filename]` (filename only, no path). This sub-heading is the ONLY thing the agent generates in this section — everything below it is the source's body verbatim.
2. Copy the source's entire `## 1. Feature Overview` body (everything between the `## 1. Feature Overview` line and the next `## ` heading in that source) verbatim. This includes the source's own `### Motivation`, `### Proposed changes`, and any optional extra sub-headings (`### Notes`, `### Video`, etc.). Do NOT renumber, re-level, or re-order the source's internal sub-headings.
3. Between sources, emit a horizontal rule (`---`) on its own line.

The chronological-by-timestamp ordering is deterministic and reflects the feature's actual timeline, not the order the user happened to type the filenames. If two sources share an identical `Generated` timestamp (unlikely), fall back to the user-provided order.

**Why verbatim:** the merged file is loaded as context for future chats, not used as a single unified PR description. Future PR descriptions for new versions (V2, V3, …) will be authored by `summarize-chat-new` or `summarize-chat-update` against their own chat, not derived from this merged Feature Overview. So losing nothing here costs nothing — keeping each source's section copy-pasteable preserves the original PR-description provenance.

#### Step 3: Merge Each Canonical Section

Apply the rules below per section. The general principle: **union with dedupe, source provenance preserved where useful, content verbatim**.

##### Background

Concatenate paragraphs from all sources, in source order (oldest → newest by `Generated` timestamp). Add a one-line lead-in identifying the source if the paragraphs are non-trivial:

```
**From V0 (convert-flow-tables):** [V0's Background paragraphs verbatim]

**From V1 (convert-flow-tables-v1):** [V1's Background paragraphs verbatim]
```

Skip the lead-ins only if a source's Background is missing or empty. Do not paraphrase. Do not interleave sentences across sources.

##### Architecture & Key Decisions

**This is where the merge skill earns its keep.** Concat all bullets from all sources, then dedupe:

1. **Exact duplicates** (same decision text within ~10% character diff) → keep the longer/more detailed version, drop the shorter. Note the source of the kept version inline as `(from V1)`.
2. **Semantic near-duplicates** (same decision, different phrasing or different file paths but same architectural point — e.g. "use `asGetter(appSystemV2Key)` because AppSystemV2 isn't registered at init" appearing in both V0 and V1) → merge into one bullet, citing both sources: `(V0 + V1)`.
3. **Source-specific decisions** (only one source mentions it) → keep verbatim, suffix with source tag: `(V0 only)` or `(V1 only)`.
4. **Conflicting decisions** (V0 says "do X", V1 says "do Y, X was a mistake") → **never silently drop the older one**. Keep both bullets and add a third bullet noting the supersession: `**Superseded:** V0's "do X" was changed to V1's "do Y" because [V1's reason]`.

When in doubt, **keep both bullets**. Architecture loss across a merge is the highest-cost regression vector.

Ordering: group merged bullets thematically (DI / icons / analytics / hooks / etc.) when one of the sources already does so; otherwise preserve the order from the most recent source and append source-specific bullets from older sources at the end of each thematic block.

##### Constraints & Anti-Patterns

Same union-with-dedupe rule as Architecture. Constraints are even more conservative — when in doubt, keep both. Source-tagging is optional for constraints (they tend to be evergreen rules, not version-specific decisions); use source tags only when a constraint clearly applies to one version's code area only.

Code snippets (≤ 3 lines) are kept verbatim with their constraint.

##### Current Implementation State

* **Completed**: Union all bullets from all sources. **Always suffix each item with its source tag** (`(V0)`, `(V1)`, etc.) — Completed items document historical capability, and provenance matters for traceability. If a capability appears in multiple sources (e.g. V0 added it, V1 refactored it), keep one bullet citing both: `(V0 → refactored V1)`.
  * Re-group across sources if duplication is heavy: a single grouped bullet citing 2 sources is better than 2 near-identical bullets.
* **Known Issues**: Union with no dedupe (they're cheap, and an issue that V0 listed but V1 didn't might have been forgotten, not resolved). Suffix each with source tag.

##### Critical Files

Dedupe by file path:
1. If the same path appears in only one source → keep its description verbatim.
2. If the same path appears in multiple sources with **identical** descriptions → keep one.
3. If the same path appears with **different** descriptions → merge: keep the more specific description as the primary, append the other in parentheses, and tag with sources: `path/to/file.ts — primary description; also: secondary description (V0 + V1)`.
4. Order: keep paths grouped by package/directory, preferring the order from the most recent source.

##### Past Chat References

Merge each subsection separately:

**`### Summary Sessions`** — union all entries from all sources, chronological order, renumbered 1..N. Preserve transcript paths verbatim.

**`### Related Chats`** — union all entries from all sources (omit subsection if none). Dedupe by chat UUID; if the same UUID appears in multiple sources, keep one entry.

If a source uses a flat list (legacy, no subsections), treat all entries as Summary Sessions.

If the same chat UUID appears in both Summary Sessions and Related Chats across sources, keep it in Summary Sessions only.

#### Step 4: Merge Non-Canonical Sections

For each non-canonical section identified in Step 0:

1. **If the same heading + identical body appears in multiple sources** (e.g. both V0 and V1 have an identical `## 0. MANDATORY agent rules` block) → keep one copy, place it at the position it occupied in the most recent source.
2. **If the same heading appears with diverging bodies** (e.g. V1's `## 0.` has additional rules V0's lacks) → merge the bodies: take the union of bullets/rules, preserve all code snippets, and place at the position from the most recent source. Add a note at the top of the section: `_Merged from V0 + V1 — all rules from both sources preserved._`
3. **If a non-canonical section appears in only one source** → preserve it at its original position, tagging the heading with the source if the heading is generic enough to be ambiguous (e.g. `## Migration Notes` → `## Migration Notes (V1)`).

The "Section Inventory Match" rule from compress carries over: **the merged file must contain at least as many distinct non-canonical sections as the union of all sources** (after dedupe-by-identical-body). Never silently drop one.

#### Step 5: Write the Merged File

Write to `<chat-context-summary-dir>/CHAT_CONTEXT_SUMMARY_<new-timestamp>_<merged-feature-name>.md`.

**Per-source `Merged from` entry format.** Each source contributes a multi-line entry under the top-level `**Merged from**:` header field. Capture every piece of provenance metadata the source's header had:

```
  - `<source-filename>`
    - Generated: <source-Generated-value>
    - Feature: <source-Feature-value>
    - Branch: <source-Branch-value or "(missing)">
    - Repository: <source-Repository-value or "(missing)">
    - Pull request: <source-Pull-request-value or "(missing)">
    - Transcripts path: <source-Transcripts-path-value or "(missing)">
    - Compression mode: <source-Compression-mode-value or "(missing)">
```

All fields are extracted verbatim from each source's header. If a source is missing a field (older summaries may not have `Pull request`, `Compression mode`, or `Transcripts path`), write `(missing)` — never invent a value.

Do NOT modify or delete the source files. They remain as historical record. The user is responsible for archiving or deleting them after verifying the merge.

### Output Format

```
# Chat Context Summary - [Merged Feature Name]

**Generated**: [NEW_TIMESTAMP] (Merged from [N] sources)
**Feature**: [MERGED_FEATURE_NAME]
**Merged from**:
  - `[source-1-filename]`
    - Generated: [source-1-Generated]
    - Feature: [source-1-Feature]
    - Branch: [source-1-Branch or "(missing)"]
    - Repository: [source-1-Repository or "(missing)"]
    - Pull request: [source-1-Pull-request or "(missing)"]
    - Transcripts path: [source-1-Transcripts-path or "(missing)"]
    - Compression mode: [source-1-Compression-mode or "(missing)"]
  - `[source-2-filename]`
    - Generated: [source-2-Generated]
    - Feature: [source-2-Feature]
    - Branch: [source-2-Branch or "(missing)"]
    - Repository: [source-2-Repository or "(missing)"]
    - Pull request: [source-2-Pull-request or "(missing)"]
    - Transcripts path: [source-2-Transcripts-path or "(missing)"]
    - Compression mode: [source-2-Compression-mode or "(missing)"]
  - …

## [Non-Canonical Section before §1, if present from any source — see Step 4]

## 1. Feature Overview

### From [oldest-source-filename]
[Source body verbatim — entire `## 1. Feature Overview` body from the source, including its own `### Motivation`, `### Proposed changes`, and any optional sub-headings, unchanged.]

---

### From [next-source-filename]
[Source body verbatim]

---

### From [newest-source-filename]
[Source body verbatim]

## 2. Background
**From [source-1 tag]:** [source-1 Background verbatim]

**From [source-2 tag]:** [source-2 Background verbatim]

## 3. Architecture & Key Decisions
- [Union with dedupe, source tags on shared/merged/conflicting bullets per Step 3]

## [Non-Canonical Section between §3 and §4, if present from any source — see Step 4]

## 4. Constraints & Anti-Patterns
- [Union with dedupe per Step 3]

## 5. Current Implementation State

### Completed
- [Union; every item source-tagged]

### Known Issues
- [Union, no dedupe; each tagged]

## 6. Critical Files
[Union, deduped by path per Step 3]

## 7. Past Chat References

### Summary Sessions
[Union from all sources, renumbered 1..N, chronological]

### Related Chats
[Union from all sources, deduped by UUID — omit if empty]

## [Non-Canonical Section after §7, if present from any source — see Step 4]
```

### ✅ Quality Assurance Checklist

* [ ] **At Least 2 Sources:** The merge command was invoked with ≥ 2 source filenames. If 1 was provided, I stopped and asked.
* [ ] **No Source Modified:** The source files in the `chat-context-summary` kind directory are untouched; only the new merged file was written.
* [ ] **No Compression Performed:** I did NOT drop content because it "felt redundant" or "could be shorter". The only removals were near-duplicates per Step 3's explicit dedupe rules.
* [ ] **Feature Overview Verbatim & Chronological:** Each source's `## 1. Feature Overview` body is copied verbatim under a `### From <source-filename>` sub-heading, in chronological order by source `Generated` timestamp (oldest first), with `---` horizontal rules between sources. No paraphrasing, no renumbering of source sub-headings, no unification of Motivations.
* [ ] **Architecture Conflicts Preserved:** Every conflicting decision (V0 says X, V1 says Y) appears in the output as two bullets plus a third "Superseded" bullet. No silent drop of older decisions.
* [ ] **Source Provenance Tagged:** Completed items, conflicting Architecture/Constraints bullets, and divergent Critical Files descriptions carry source tags like `(V0)`, `(V1)`, `(V0 + V1)`, or `(V0 only)`. Evergreen non-version-specific Architecture bullets may omit tags.
* [ ] **Past Chat References Union Complete:** Summary Sessions and Related Chats merged separately. Every entry from every source is present (deduped by UUID within Related Chats). Transcript paths preserved verbatim.
* [ ] **Non-Canonical Sections Preserved:** Every non-canonical section from every source is present in the merged file. Identical bodies are deduped; divergent bodies are unioned (not picked-one-and-dropped-the-other). Position relative to canonical sections is preserved from the most recent source.
* [ ] **Section Inventory Match:** Count of distinct non-canonical sections in the output equals the union (after dedupe-by-identical-body) of non-canonical sections across all sources.
* [ ] **Header Provenance Complete:** Top-level header has only `**Generated**`, `**Feature**` (the new merged feature name), and `**Merged from**:`. The header does NOT contain `**Branch**:`, `**Repository**:`, `**Pull request**:`, or `**Transcripts path**:` — those live per-source inside `**Merged from**:` entries, with `(missing)` written where a source lacked the field. Each `**Merged from**:` entry contains Generated + Feature + Branch + Repository + Pull request + Transcripts path + Compression mode for that source, copied verbatim from the source's header.
* [ ] **Known Issues Union:** All Known Issues from every source are present and source-tagged. No dedupe applied to Known Issues (they're cheap to keep).
* [ ] **Critical Files Deduped By Path:** Same path appearing in multiple sources is collapsed to one entry; differing descriptions are merged (not silently picked).
