---
name: review-against-chat
disable-model-invocation: true
description: Review a spec, issue, decision log, PR description, or doc written from this chat against the chat transcript and the sources it cites. User-invoked only.
---

# Review against chat

Prove that an artifact written from this conversation says what the user agreed. Nothing missing, nothing wrong, nothing invented.

## 1. Gather inputs

- **Artifact:** a file path, or an issue or PR URL. Ask when it is unclear which one.
- **Chat:** the reviewer starts with no context, so it needs the chat itself, not your account of it. In T3 Code, pass this thread's id (`parentThreadId` from `orchestrator_capabilities`). The reviewer reads it with `t3_thread_read`. Elsewhere, pass the transcript file. `~/.agents/profiles/default/artifacts/skills-profile-me/resolve-agent-sessions/SKILL.md` finds it for Cursor and Claude Code. For another agent, find your own session file: search your agent's session folder for a distinctive phrase from the user's latest message. As a last resort, paste every user message you still have verbatim into the brief. If your context was summarized, tell the user which part of the chat the reviewer cannot see.
- **Sources:** the files, repositories, and URLs the artifact makes claims about.

## 2. Dispatch a fresh reviewer

Start one read-only subagent with a fresh context. The review routing in your instructions applies. Its brief is self-contained: the artifact, the chat, the sources, and the categories below. It edits nothing and posts nothing.

It reports each finding with a quote from the chat or a `file:line`:

- **Missing:** a decision, request, constraint, or open question the user agreed to that the artifact leaves out.
- **Wrong:** a decision stated differently from what was agreed, or an open question written as decided, or the reverse.
- **Invented:** content the user never agreed to, such as an agent's own additions.
- **Superseded:** an earlier position that a later message in the chat replaced.
- **Factual:** a claim about code, docs, or tools that the sources contradict.
- **Inconsistent:** two parts of the artifact that contradict each other.
- **Private:** personal or private content in an artifact that is or will be public.

The review is done when every user message in the chat is accounted for.

## 3. Verify and act

Check every finding against the chat and the sources yourself. Drop the ones that do not hold.

- **Local draft:** fix each finding that restores what the user agreed. Keep a `<name>.before-review.<ext>` copy beside it.
- **Published artifact** (issue, PR, post): show the findings and ask before you edit.
- **Invented content, or anything that needs a new decision:** ask the user.

Report the findings by category with their evidence, what you changed, and what still needs the user's decision.
