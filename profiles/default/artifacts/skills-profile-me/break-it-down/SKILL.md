---
name: break-it-down
description: User-invoked only. Walk a code flow in numbered steps with file pointers, then go deeper or visualize only where the user asks.
disable-model-invocation: true
---

# Break it down

User-invoked only. Run only when the user typed `/break-it-down` or attached this skill as "break it down". Never auto-trigger from ambient chat.

This skill is **short-then-deeper**. Pass 1 is a numbered timeline for one example. Later answers are longer on purpose, and only for the number they name.

Do not implement or refactor unless they ask.

## Language

Talk to the user using `ASD-STE100 Simplified Technical English`. Apply this to every sentence the user reads. Do not apply it to code citations, file paths, identifiers, or quotes from the source.

Rules:

- Write short sentences. Maximum 20 words for instructions. Maximum 25 words for descriptions.
- Write one idea in each sentence.
- Use the active voice.
- Use the simple present tense for descriptions.
- Use the imperative mood when you tell the user what to do.
- Do not join independent clauses with a semicolon.
- Do not write more than three nouns together.
- Do not omit articles (`a`, `an`, `the`) or verbs.
- Use the same name for the same thing. Prefer the name from the code.
- Keep Technical Names as they appear in the code (`useToggle`, file names, flag keys).
- Do not use slang, metaphor, or filler.

Do not put WORK_STATE, transcript paths, or skill meta in the breakdown.

```
Bad: The hook is basically wiring up listeners and then, when the fetch returns, it'll update both lists.
Good: The hook adds the listeners. When the fetch returns, the hook updates the two lists.
```

## 1. Inputs

Need both:

- **Scope** — current branch, a PR, a file, or a named flow
- **Checkout** — git root of the files they have open, or the worktree they named

If either is missing, ask which flow and which checkout. Then stop.

Resolve checkout from what they are actually using. Never assume workspace root[0].

```bash
git -C <directory-of-an-open-file> rev-parse --show-toplevel
```

If they named a path (`app/`, `pkg/`, a PR checkout), use that absolute root. Do not open files from a sibling worktree.

**Done when:** you have an absolute checkout path and a named flow.

## 2. Phase A — Map (silent)

Read the relevant files in that checkout. Identify, do not dump:

- **When** each piece runs (boot, open record, click tab, fetch returns)
- **Stored vs executed**
- **Shared vs per-entry-point**
- Two UIs that look like they share state but don't (or vice versa)

**Done when:** you can walk one concrete example through time without guessing.

## 3. Phase B — Initial breakdown

One example. Number by time in the user/system flow, not by file. One idea per number.

```
**Example:** <one concrete item moving through the flow>

**1. <when>** — <one or two sentences>
<optional 1–3 line citation>

**2. <when>** — ...
```

Rules:

- Short what/why per step. Skip helper trivia until they go deeper.
- Name lists/sets honestly (what is in them, whether they are editable).
- Do not say "always disabled" about a whole tab if only one of two lists is disabled.
- Do not explain both paths in full detail yet.
- Do not dump every file.
- Citations are optional here. If you cite, follow **Citation integrity**.

Language: `ASD-STE100 Simplified Technical English` (see **Language**).

End with: they can say **go deeper on N**. They can also say **visualize** for an HTML flowchart. Then **stop and wait**. Do not pre-expand any number. Do not write the HTML yet.

**Done when:** the timeline is posted, every sibling number is still collapsed, the visualize offer is in the close, and you have stopped.

## 4. Follow-ups (later turns)

Keep the same numbering. Do not rewrite the whole timeline unless they ask to start over.

**"Where" / "which file"** — Re-read, then add citations to the existing numbers. Still short. Still one checkout.

**Yes/no about a number** — Answer the yes/no in one sentence first. Then expand only that number.

**Go deeper on N** — Phase C.

**Visualize / draw the flow / flowchart** — read [`VISUALIZE.md`](VISUALIZE.md). Do that work in this turn.

Do not pre-expand 5 if they asked about 4.

## 5. Phase C — Deeper (on request)

Split the named number into **N.a**, **N.b** (same numbering). Add more prose and more citations.

Also add the constraint the code cannot show: package boundary, why inject, why context, why call on the service.

Distinguish lists/widgets that look similar (e.g. an editable list vs a read-only list).

Keep sibling numbers collapsed.

**Done when:** only the named number is expanded, citations were re-read this turn, and you have stopped again.

## 6. Citation integrity (**wrong-tree**)

Before every citation block: Read the file in the resolved checkout. Never cite from memory. Verify line numbers by reading immediately before citing.

Prefer **absolute paths**. Relative paths in a multi-root workspace often open the wrong repo (e.g. master instead of the worktree).

Required format:

```12:18:/absolute/path/to/file.ts
```

If they say the snippet doesn't match, you cited the wrong tree. Fix it. Don't argue.

**Done when:** every citation in the message was read from that checkout in this turn.

## Do not

- Auto-invoke
- Start implementing unless they ask
- Write a novel on pass 1
- Write the visualization HTML on pass 1, or into the repo
- Open files from a different worktree than the one under discussion
- Pre-expand numbers they did not name
