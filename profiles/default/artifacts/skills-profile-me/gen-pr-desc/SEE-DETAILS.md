# "See details" blocks

A **See details** block is a collapsible section under one `### Proposed changes` bullet, or under any other description item the user names. It holds the code-level story of that item for reviewers who want it. The bullet above it stays a user-visible outcome.

## 1. Offer the blocks — last, in the closing message

Generate the complete deliverable first, with no See details blocks and no questions: the whole PR description, or the whole chat summary file with every section and checklist item done. The offer comes only after that.

1. While generating, look up the pull request for the current branch: `gh pr view --json url,number,headRefOid`. Record its URL, number, and head commit, or record that no PR exists. This is a lookup, not a question.
2. End your final message with one plain-text offer. Name the items by their number in the list. Accept any other item the user names in the reply.
   - **PR exists:** "Want a See details block under any item? Reply with item numbers, e.g. 1, 3. The blocks will link to the changed lines on <PR link>."
   - **No PR:** the same question, plus: "I found no pull request for this branch, so the blocks will have no GitHub links. Links can be added once the PR exists."
3. Write the offer as text in the message. A question or poll tool pauses the job and asks in the middle, so leave those tools out of this step.

**Done when:** the deliverable is complete and your final message ends with the offer. Do not wait for an answer. When the user replies with items, write the blocks in that next turn.

## 2. Write each block

Shape. GitHub renders the block inside the bullet only with the blank lines and the two-space indent:

```markdown
- <outcome bullet, unchanged>

  <details>
  <summary>See details</summary>

  <prose>

  </details>
```

Content:

- **Chat first, diff second.** Build the story from the chat conversation first: the user's explanations, the investigation, and the decisions and rejected approaches discussed there. They carry the why that a diff cannot show. Then read the PR diff (the branch diff when no PR exists) to confirm what actually shipped and to find the lines to link. When the two disagree, describe what the diff shows and keep the chat reasoning that still applies to it.
- **Prose carries the block.** For a fix, state the cause, then what the code does now. For a feature, state what the code does and why it is built that way. Two to four short paragraphs, in teammate-prose voice.
- **Name the code.** Files, functions, and code paths belong here. This is the place for the HOW that the bullet leaves out.
- **Link each code claim** right after the sentence it supports (see Links). Without a PR, name the file in backticks instead.
- **Example diff, only when the shape of the change says more than prose.** Typical cases: a call that changed shape, a changed signature, a moved guard. Prose alone covers test rewrites, renames, and config changes.
- **Label every example diff.** Put this sentence right above it: "This is a simplified example of the change. The real change is in [`<file>`, lines X to Y](<link>)." Without a PR, end the sentence with "The real change is in `<path>`." Keep the diff to a few lines in a `diff` fence.

**Done when:** every picked item has a block, every code claim has a link (PR exists) or a file name (no PR), and every example diff has its label sentence.

## Links

Use these only when a PR exists. Take line numbers from the PR diff: number its lines from the `@@ -<old> +<new> @@` hunk headers of `gh pr diff <number>`.

| Target | URL |
|---|---|
| Whole file in the PR diff | `<pr-url>/files#diff-<hash>` |
| Removed lines | `<pr-url>/files#diff-<hash>L<a>-L<b>` (old-file numbers) |
| Added lines | `<pr-url>/files#diff-<hash>R<a>-R<b>` (new-file numbers) |
| Removed and added together | `<pr-url>/files#diff-<hash>L<a>-R<b>` |
| File outside the PR diff | `<repo-url>/blob/<headRefOid>/<path>#L<a>-L<b>` |

`<hash>` is the SHA-256 of the repo-relative path: `printf '%s' '<path>' | shasum -a 256`. Blob links use the PR head commit so the lines stay put when the base branch moves.

## Updating a description that has blocks

Keep every existing block and the user's wording in it. When new commits moved the lines, refresh the line numbers in the links. When a PR now exists and a block has no links, mention that in the closing offer from step 1, so the user can ask for the links.
