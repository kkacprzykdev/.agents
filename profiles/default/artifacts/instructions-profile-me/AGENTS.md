## Model routing (T3 Code)

**Check.** Run it once per thread, the first time a request matches a child row of the table. The other rows need no check.

1. Call T3's `orchestrator_capabilities` tool (any prefix, e.g. `mcp__t3-code__orchestrator_capabilities`). When it isn't listed, run one tool search for it, since T3 often attaches its tools late. If it isn't found, or the call fails, you are outside T3 Code: ignore this section and work as usual.
2. Its `inheritedProviderInstanceId` picks your column: `claudeAgent` → Claude thread, `codex` → Codex thread. Its `parentThreadId` is your own thread's id.
3. Call `t3_thread_read` on that id with `limit: 1`. `relationshipToParent` is `null` on a main thread and `"subagent"` on a child. On a child, read its `parentThreadId` the same way: `"subagent"` there too makes you a grandchild. A native subagent (spawned by your provider's own subagent tool) counts as a child.

**Routing table.** Pick the row by job, the column by step 2.

| Job | Claude thread | Codex thread |
|---|---|---|
| **Review**: any review, whatever it covers (code, a diff, a branch, a PR, a function, a plan, a spec, a doc, a design), from any request or skill | child · `codex` · `gpt-6.1-sol` · `reasoningEffort: high` | child · `claudeAgent` · `claude-opus-5-5` · `effort: high` |
| **Deep research**: multi-source, or facts newer than your training | child · `codex` · `gpt-6.1-sol` · `reasoningEffort: medium` | same as Claude thread |
| **Image generation** | child · `codex` · `gpt-6.1-sol` · `reasoningEffort: medium` | inline |
| **Computer use**: controlling desktop apps | child · `codex` · `gpt-6.1-sol` · `reasoningEffort: medium` | inline |
| **Chrome**: the request names Chrome | child · `codex` · `gpt-6.1-sol` · `reasoningEffort: medium`, via the Codex Chrome plugin | inline via the Chrome plugin on `gpt-6.1-sol`; on another model, same as Claude thread |
| **Browser**, Chrome not named | inline, in the T3 browser (`preview_*` tools) | same |
| Everything else, quick lookups included | inline, on the thread's current model and settings | same |

**Rules.**

- **Child** means one `delegate_task` call. Use one for every child row, whether or not the request says "subagent". Set `target.providerInstanceId`, `target.model` and the effort option every time (`options.reasoningEffort` for Codex, `options.effort` for Claude), since T3's default effort is lower than the table's.
- **Brief**: start every child brief with `[t3-routed: <job>]`, naming the table row it carries (e.g. `[t3-routed: review]`). Then make it self-contained, because the child sees none of this conversation. For review and research, tell the child to leave files unchanged.
- **Children** route too, with two limits. A child does the job its `[t3-routed: <job>]` tag names itself, since it already runs on that job's target; routing it again would bounce between providers. Any other job a child meets goes through the table as usual. A grandchild does everything inline, which caps delegation at two levels.
- The table's target wins over a similar tool in your own thread, such as Claude in Chrome or Claude computer use.
- **Review**: every reviewer in a review is a child on that review's model and effort, and the delegating agent merges their findings. When a skill (e.g. the third-party `code-review`) spawns reviewers with the native subagent tool, start each one with `delegate_task` instead. Keep the skill's reviewer prompts and its merge step as written. Start all reviewers before waiting on any, so they run in parallel.
- **Extra review**: when the user asks for another, a second, or an additional review on a named model ("also", "plus"), run it in addition to the table's review, not instead of it. It mirrors the table's review, with the same reviewers and prompts (e.g. both of a skill's reviewers), all on the named model, with model and effort resolved as in Overrides. When resolving means asking the user, hold every review until they answer, then start them all together. Report the reviews side by side, marking where they agree and where they differ.
- **Overrides**: the user wins. Naming a model, without asking for an extra review, replaces the table's target, and the job still runs as a child at the user's stated effort, or the table's when none is stated. Resolve a named model and effort to their ids in `orchestrator_capabilities`, and ask the user when either isn't listed. Saying "do it yourself" or asking for a new thread also overrides the table. For a new thread, use `t3_thread_launch` with the table's target.
- **Verify** a child's output before relaying it: the image file exists, and the review cites real lines.
