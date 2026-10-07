---
---

# Compress Bloated Chat Context Summary

**Storage:** Resolve the Active profile (`profile-references.mdc`). `<chat-context-summary-dir>` is the Output map kind `chat-context-summary`.

Read the most recent summary file under the Active profile Output map kind `chat-context-summary` that matches `CHAT_CONTEXT_SUMMARY_*_[PROMPT_FEATURE_NAME].md` and produce a **compressed replacement** in the same file.

## When to Use

Use this command when a summary has grown unwieldy after many updates (typically 5+ updates, 100+ lines, or 10+ constraints). This command resets the document to a compact state while preserving all essential knowledge.

## Slash Command

Read the existing summary, analyze the current git state, and produce a compressed version that preserves critical knowledge while aggressively removing completed/historical bulk.

### 🛑 CRITICAL: Timestamp Rules 🛑

1.  **Generation Command:** Execute `TZ='Europe/Warsaw' date '+%Y-%m-%d-%H-%M-UTC%z'` for the new timestamp.
2.  **Header:** Replace ALL old timestamp lines with a single new `**Generated**:` and add `**Compressed from**:` showing the original generation date and update count.
3.  **Branch:** Preserve `**Branch**:` from the old summary. If missing, execute `git branch --show-current` and add it.
4.  **Repository:** Preserve `**Repository**:` from the old summary. If missing, execute `git rev-parse --show-toplevel` in the relevant repo and add it.
5.  **Pull request:** Preserve `**Pull request**:` verbatim from the old summary if present. If missing but known from the current chat (user shared PR, or `gh pr view` for this branch), add the full URL after `**Repository**:`.

### 🛑 MANDATORY FIRST STEP: Ask Compression Mode 🛑

Before reading the source summary, before creating the backup, before doing anything else, you MUST ask the user which compression mode to apply for this run. Summaries vary wildly in size (80 lines to 800+ lines), so a single set of fixed item caps does not generalize. The user picks the sizing strategy; the agent enforces it.

**Step A — Quick scan to inform a recommendation.** Before asking the question, open the source file once and count two things:

1. **Total line count** of the file (e.g. `wc -l`).
2. **Architecture bullet count** — number of `- ` / `* ` / `N. ` bullets inside `## … Architecture & Key Decisions` (the section heading may be `## 2.` or `## 3.` depending on whether a Background section already exists).

These are the two strongest predictors of which mode will actually compress. Verbatim sections (Feature Overview, Past Chat References, Non-Canonical) and Known Issues don't compress under either mode, so raw line count alone is misleading — Architecture bullet density is what tells you whether no-limits can shrink the doc meaningfully.

**Step B — Pick a recommendation using this heuristic.** The thresholds are guidelines, not hard rules:

| Architecture bullets | Total lines | Recommended mode |
|---|---|---|
| < 15 | < 200 | **No limits** — qualitative pass alone usually hits ≥30% floor |
| 15–25 | 200–350 | **Percentage-based, 60% retention** (safer than no-limits, gentler than 50%) |
| 25+ | 350+ | **Percentage-based, 50% retention** (or lower if the user wants aggressive) |

If the two signals disagree (e.g. 12 Architecture bullets but 600 lines because Past Chat References is huge), trust **Architecture bullets** — that's the section the mode actually controls.

**Step C — Ask the question with the recommendation embedded, concisely.** Use a structured question (e.g. `AskQuestion` tool). Do NOT default silently. Do NOT carry over a previous run's choice. Each compression run requires a fresh, explicit answer.

In the question prompt, include ONE short sentence stating the source size (`<N> lines, <M> Architecture bullets`) and your recommended mode + reason (e.g. "Recommendation: percentage-based 50% — Architecture has 45 bullets, no-limits will likely leave them mostly intact"). Keep the rationale to one sentence; the user already understands the trade-offs, they just need the data and the suggestion.

Present **exactly two** options with these labels and descriptions:

1. **Percentage-based** — Each item-counted section (Constraints, Completed, Critical Files) is compressed to a target percentage of its original item count, computed from the source. Suitable when the source has obvious bloat across many items and you want predictable, proportional shrinkage. **If selected, follow up with a single retention-percentage question** offering options like `30%`, `50%` (default), `70%`, or `Custom`. If `Custom`, ask for a number between 10 and 90. If your heuristic in Step B recommended a specific retention %, pre-select it as the default in the follow-up question.

2. **No limits** — Sizing is driven purely by the 🔴/🟡/⚪ classification in Step 1. Sections end up as large or as small as the surviving content needs. Suitable when the source is already terse, when you suspect the qualitative pass alone will hit the ≥30% compression-ratio target, or when the user wants to avoid arbitrary item drops.

The user is free to override your recommendation — record whatever they pick, not what you suggested. The recommendation is a hint to save them a back-of-the-envelope estimate, not a vote.

**Record the chosen mode** at the top of your working notes for this run (e.g. `Compression mode: percentage-based, 50% retention` or `Compression mode: no limits`) and **place it in the new summary's header** as `**Compression mode**:`. This makes future re-compressions and audits aware of which sizing strategy was applied.

Both modes still respect:
- The compression ratio target (≥30% shorter than original — a hard floor that overrides the no-limits mode if classification alone doesn't shrink enough).
- All "PRESERVE VERBATIM" rules (Feature Overview, Past Chat References, Non-Canonical Sections, Known Issues).
- The 🔴/🟡/⚪ classification logic in Step 1.

The mode choice ONLY affects per-section item-count budgets in Step 2. It does NOT relax any verbatim-preservation rule.

### Compression Protocol

#### Step 0: Backup

Before modifying anything, create a backup of the original summary file. Copy it to the same directory with `_backup` appended before the extension:

```
cp <chat-context-summary-dir>/CHAT_CONTEXT_SUMMARY_[TIMESTAMP]_[FEATURE].md \
   <chat-context-summary-dir>/CHAT_CONTEXT_SUMMARY_[TIMESTAMP]_[FEATURE]_backup.md
```

Verify the backup exists before proceeding. If the backup file already exists (from a previous compression attempt), append a numeric suffix: `_backup2`, `_backup3`, etc.

#### Step 1: Classify Everything

**First, enumerate top-level sections.** Before classifying content, list every `## ` heading in the document **in order of appearance** and tag each as **canonical** (one of the seven: Feature Overview, Background, Architecture & Key Decisions, Constraints & Anti-Patterns, Current Implementation State, Critical Files, Past Chat References) or **non-canonical** (anything else, e.g. `## 0. MANDATORY agent rules`, `## Appendix`, `## Glossary`, `## Open Questions`, `## Migration Notes`, `## Decision Log`). For each non-canonical section, **record its position relative to neighbouring canonical sections** (e.g. "before §1", "between §3 and §4", "between §6 and §7", "after §7"). A summary can contain **zero, one, or many** non-canonical sections, distributed at **any** of these positions — they are NOT restricted to the start or end of the document. Authorship is irrelevant: a non-canonical section may have been written by a human or by a previous agent during a `summarize-chat-update` run; both are equally protected. Non-canonical sections are handled by their own preservation rule in Step 2 — do NOT redistribute their content into the canonical sections.

Then read the canonical sections and classify each piece of information inside them:

* **🔴 Architectural** — Decisions/patterns that explain **non-obvious behavior, API quirks, workarounds, or design rationale** that a future agent would need when modifying or extending the feature. KEEP as concise bullets in Architecture section.
* **🟡 Background** — Decisions/patterns that are straightforward and self-evident from reading the code (e.g., "added feature flag", "created translation key"). COMPRESS into prose.
* **⚪ Dead Weight** — One-time fixes that won't recur (e.g., "removed console.log"), verification tags for completed work, overly detailed file listings for stable subsystems. DELETE.
* **🟢 Non-Canonical Section** — The entire body of any non-canonical top-level section identified above. PRESERVE in place per the Step 2 rule; do NOT apply 🔴/🟡/⚪ classification to it.

#### Step 2: Build Compressed Document

**Header** — Fresh timestamps, git state, compressed-from metadata.

**Feature Overview (= PR Description)** — **PRESERVE VERBATIM.** Copy the entire section exactly from the old summary without compression or rewording. Feature Overview is the PR description: `### Motivation` and `### Proposed changes` per the Active profile **PR description generator**. If the old summary has `Feature Overview` in the old format (no those subsections), convert it: resolve the Active profile (`profile-references.mdc`), read IN FULL `~/.agents/profiles/default/artifacts/rules-profile-me/teammate-prose.mdc` and the artifact path in Active profile references/shared.md **PR description generator**, then rewrite as `### Motivation` (user problem) and `### Proposed changes` (outcomes) from the old summary's implementation state + git diff. Every profile defines that section. If you do not find it, stop and tell the user. Do not substitute another generator.

**Background** *(NEW section)*: Compress self-evident, straightforward decisions (🟡 classified) into dense prose. The goal is that an agent reading this section gets a high-level understanding of what was built without needing the full history. Think of it as "here's the feature shape and the standard patterns used."

* **Percentage-based mode:** Aim for `~ceil(N_original_paragraphs × retention_%)` paragraphs of summarized prose, where `N_original_paragraphs` counts paragraphs across all 🟡-classified content in the source. Round to at least 1 paragraph.
* **No-limits mode:** As many paragraphs as the surviving 🟡 content warrants. Stay terse — this is summary prose, not a re-narration.

In either mode, never include verification tags or chat-history fragments in the Background section.

**Architecture & Key Decisions** — Preserve ALL decisions classified as 🔴 Architectural:
* Decisions that explain **non-obvious behavior**: API quirks, workarounds, unintuitive parameter choices, DI wiring gotchas, async patterns, timing issues, type system workarounds.
* The test: "Would a future agent re-discover this the hard way if it's not documented?" → KEEP.
* Compress each bullet to 1-2 sentences (remove verbose rationale), but preserve the core decision and the "why".
* If all decisions are self-evident from the code, this section can be minimal. But for complex features, expect 8-15 bullets to survive compression.

**Constraints & Anti-Patterns** — Keep constraints where the anti-pattern is non-obvious and touching the same files could easily re-trigger it (e.g., wrong function call order, wrong scope parameter, wrong DI registration). Delete constraints that are obvious from reading the code or that relate to one-time mistakes unlikely to recur.
* **Budget — depends on the compression mode chosen at the start:**
  * **Percentage-based mode:** Keep `ceil(N_original × retention_%)` constraints, where `N_original` is the count of constraints in the source. Always round UP — losing one edge-case constraint is more costly than carrying one extra. Prioritize by "how likely is a future agent to hit this trap?" — drop the lowest-likelihood ones first.
  * **No-limits mode:** No numeric cap. Keep every constraint that passes the "non-obvious AND likely to re-trigger" test. If the source has 30 constraints and 28 of them pass that test, keep 28.
* Include code snippets (max 3 lines) for non-obvious ones, in either mode.

**Current Implementation State**:
* **Completed**: Compress into a **single bullet list of capabilities** (no verification tags — they served their purpose). Group related items (e.g., "DI wiring complete: service interface, impl, activator, widget injection" instead of 4 separate items) before applying the budget.
  * **Percentage-based mode:** Target `~ceil(N_original_grouped × retention_%)` items, where `N_original_grouped` is the count AFTER you have grouped related items. Grouping happens first, the percentage applies to the grouped count.
  * **No-limits mode:** As many grouped capability bullets as the source warrants. Grouping still applies — even no-limits mode does not justify ungrouped duplicates.
* **Known Issues**: Keep in full detail. **Not subject to either mode's budget** — Known Issues are always preserved verbatim regardless of count.

**Critical Files** — ONLY files most relevant to the feature's core logic. No Reference Files section needed (the Background paragraph covers what existed before).
* **Percentage-based mode:** Keep `~ceil(N_original × retention_%)` files, prioritizing those most likely to be touched in current/next work.
* **No-limits mode:** All files genuinely critical to current/next work; no artificial cap. If the source listed 8 truly critical files, keep 8.

**Past Chat References** — **PRESERVE IN FULL.** Copy both `### Summary Sessions` and `### Related Chats` (if present) verbatim from the old summary. Never compress, truncate, or remove entries. If the old summary uses a flat list (no subsections), keep it as-is — do not restructure during compression. If `**Transcripts path**:` exists in the old header, preserve it in the new header.

**Non-Canonical Sections** *(any top-level section outside the seven canonical ones — identified in Step 1, regardless of whether a human or a prior agent authored it)* — **PRESERVE IN PLACE WITH MINIMAL COMPRESSION.** These are sections that someone (human or agent) added deliberately during initial generation or a later update (e.g. `## 0. MANDATORY agent rules`, `## Appendix`, `## Glossary`, `## Open Questions`, `## Migration Notes`, `## Decision Log`). They sit outside the standard compression rubric because their cost-of-loss is high and their content is usually already terse.

* **Position — interleaving is allowed anywhere:** Keep the original position recorded in Step 1. Non-canonical sections may sit **before §1**, **between any two consecutive canonical sections** (e.g. between §3 and §4, between §5 and §6), **after §7**, or **multiple positions at once**. There is no "preferred" slot — preserve whatever the source had. If two non-canonical sections appear in the source in the same gap (e.g. both between §6 and §7), preserve both in the same order.
* **Heading:** Copy the heading text verbatim, including any number prefix (`## 0.`, `## A.`, `## 7.5`) or absence of one (`## Glossary`). Do NOT renumber to fit the sequential 1–7 layout — sequential numbering applies only to the canonical sections. If a non-canonical section sits between §3 and §4 with the heading `## Decision Log`, leave it as `## Decision Log`; do NOT promote it to `## 3.5 Decision Log` or renumber the canonical sections around it.
* **Content — what you MAY trim:** resolved TODO/FIXME lines, completed-status checkmarks (`✅ Done`), one-time reminders that have clearly served their purpose, obviously redundant prose where the same sentence is repeated.
* **Content — what you MUST keep:** every rule, every "do this / don't do this" instruction, every code snippet, every example, every cross-reference link, every explicit warning tied to a past bug, every nuance the original author (human or agent) phrased deliberately. Do NOT reword instructional content into your own phrasing — copy it as written. Authorship does not change this rule: agent-authored guardrails (e.g. a `## Migration Notes` block a prior `summarize-chat-update` run added) are protected exactly as strongly as human-authored ones.
* **Default:** when in doubt, copy verbatim. A non-canonical section that grows by 5 lines costs nothing; one that loses a critical rule costs a future agent a regression.

### Output Format

Non-canonical sections (if any were identified in Step 1) are interleaved at their original positions. **Eight possible insertion points exist:** before §1, between §1↔§2, §2↔§3, §3↔§4, §4↔§5, §5↔§6, §6↔§7, and after §7. The template below shows representative placeholders at three of those eight points (before §1, between §3 and §4, after §7) — they are illustrative, not exhaustive. **Apply the same rule at every gap:** if a non-canonical section existed there in the source, render it there in the output; if not, omit the placeholder entirely. Multiple non-canonical sections in the same gap → render all of them, in source order.

```
# Chat Context Summary - [Feature Name]

**Generated**: [INSERT_TIMESTAMP_FROM_COMMAND_HERE] (Compressed summary)
**Compressed from**: Original [ORIGINAL_DATE], [N] updates over [date range]
**Compression mode**: [percentage-based, X% retention | no limits]
**Feature**: [PROMPT_FEATURE_NAME]
**Branch**: [PRESERVE_FROM_OLD_SUMMARY or discover via git branch --show-current]
**Repository**: [PRESERVE_FROM_OLD_SUMMARY or discover via git rev-parse --show-toplevel]
**Pull request**: [PRESERVE_FROM_OLD_SUMMARY — omit line if absent and unknown]
**Transcripts path**: [PRESERVE_FROM_OLD_SUMMARY, or the resolver's header via resolve-agent-sessions if missing]

## [Non-Canonical Section before §1, if present — preserve heading + content verbatim, e.g. "## 0. MANDATORY agent rules"]

## 1. Feature Overview

### Motivation
[PRESERVE VERBATIM from old summary]

### Proposed changes
[PRESERVE VERBATIM from old summary]

## 2. Background
[Dense prose summarizing the feature shape and standard patterns used. Size per chosen mode — see Step 2 "Background" budget.]

## 3. Architecture & Key Decisions
[All non-obvious decisions. Concise 1-2 sentence bullets.]

## [Non-Canonical Section between §3 and §4, if present — preserve heading + content verbatim, e.g. "## Decision Log", "## Migration Notes"]

## 4. Constraints & Anti-Patterns
[Non-obvious constraints. Count per chosen mode — see Step 2 "Constraints" budget. Code snippets (max 3 lines) where non-obvious.]

## 5. Current Implementation State

### Completed (Compressed)
- [Grouped capability summaries. Count per chosen mode — see Step 2 "Completed" budget.]

### Known Issues
[Full detail — NOT subject to either mode's budget.]

## 6. Critical Files
[Files relevant to the feature's core logic. Count per chosen mode — see Step 2 "Critical Files" budget.]

## 7. Past Chat References

### Summary Sessions
[PRESERVE VERBATIM FROM OLD SUMMARY]

### Related Chats
[PRESERVE VERBATIM IF PRESENT — omit subsection if absent in source]

## [Non-Canonical Section after §7, if present — preserve heading + content verbatim, e.g. "## Appendix", "## Glossary"]
```

*Placeholders not shown for the §1↔§2, §2↔§3, §4↔§5, §5↔§6, §6↔§7 gaps — those gaps follow the exact same rule as the three illustrated above.*

### ✅ Quality Assurance Checklist

* [ ] **Compression Mode Asked:** Before any other action this run, I asked the user (via `AskQuestion` or equivalent structured prompt) to choose between percentage-based and no-limits modes. I did NOT default silently. I did NOT carry over a previous run's choice. The user's answer is recorded in the `**Compression mode**:` header field.
* [ ] **Mode Recommendation Provided:** Before asking the question, I scanned the source for total line count and Architecture bullet count, applied the Step B heuristic, and embedded a one-sentence recommendation (mode + reason + numbers) in the question prompt. The recommendation was a suggestion, not a default — I recorded whatever the user actually picked.
* [ ] **Backup Created:** A `_backup.md` copy of the original summary exists in the `chat-context-summary` kind directory.
* [ ] **Compression Ratio:** The new document is at least 30% shorter than the original. (This is a hard floor — if no-limits mode produced a document <30% shorter, re-tighten the 🔴/🟡 classification until the floor is met. Percentage-based mode at any retention ≤70% should hit this naturally.)
* [ ] **PR Description Preserved:** The `### Motivation` and `### Proposed changes` in Feature Overview are copied verbatim from the old summary.
* [ ] **Known Issues Preserved:** All Known Issues from the old summary are present (NOT subject to either mode's budget).
* [ ] **Non-Obvious Decisions Preserved:** Architecture section retains all decisions where a future agent would "re-discover the hard way" if undocumented (API quirks, workarounds, unintuitive parameter choices, DI gotchas, timing issues).
* [ ] **Background Section:** Contains enough context for an agent to understand the feature shape without reading the full history. Size aligns with the chosen mode (percentage-based: `~ceil(N_orig × retention_%)` paragraphs; no-limits: as many as the surviving 🟡 content warrants).
* [ ] **Per-Section Sizing Matches Mode:** Constraints, Completed (grouped), and Critical Files counts each follow the chosen mode's rule:
  * Percentage-based mode: each section ≤ `ceil(N_original × retention_%)` items, computed from the source's count for that specific section. I documented the original count and the resulting target count in my working notes for traceability.
  * No-limits mode: no artificial caps; only "non-obvious + likely to recur" (Constraints), grouping (Completed), and "genuinely critical to current/next work" (Critical Files) drive the count.
* [ ] **Compressed-from Metadata:** Original date and update count preserved for traceability. Compression mode + retention % (if percentage-based) recorded in the header.
* [ ] **Past Chat References Preserved:** All Summary Sessions and Related Chats entries from the old summary are present verbatim. `**Transcripts path**:` header field exists.
* [ ] **Pull request Preserved:** `**Pull request**:` copied from the old summary when present; added only if missing and known from this session.
* [ ] **Non-Canonical Sections Preserved:** Every top-level section in the source that was NOT one of the seven canonical sections (e.g. `## 0. MANDATORY agent rules`, `## Appendix`, `## Glossary`, `## Open Questions`, `## Decision Log`, `## Migration Notes`) is present in the output **at its original position relative to the canonical sections** — including positions *between* canonical sections (§1↔§2, §3↔§4, §6↔§7, etc.), not just before §1 or after §7. Heading text is copied verbatim (number prefix preserved or absent as in source; no renumbering to fit the 1–7 sequence). Content is kept near-verbatim. No rules, code snippets, examples, or instructional "do/don't" lines were dropped or reworded. Authorship was ignored as a discriminator: agent-authored non-canonical sections were preserved as strongly as human-authored ones.
* [ ] **Section Inventory Match:** The count of non-canonical sections in the output equals the count in the source (per Step 1's enumeration). If the source had 2 non-canonical sections, the output has 2. No silent merges, splits, or drops.
