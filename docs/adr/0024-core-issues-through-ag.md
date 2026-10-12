# Core issues are filed through ag

A Core issue goes on the issue tracker of the store that owns Core. For most users that is the Upstream store, a repository they cannot push to and that may be public. Agents file it with `ag issue bug` or `ag issue idea`, the same way they use `ag` for every other store operation (ADR 0022).

- `ag issue` finds the target itself: the `upstream` remote when there is one, otherwise `origin`. The agent never types a repository name.
- The body must use the headings of the matching issue form in `.github/ISSUE_TEMPLATE/`, and no others. Issues filed from the command line and issues filed with a form reach triage in the same shape.
- Filing takes two runs. Without `--yes`, `ag issue` only prints the repository, title, and body. The user checks it for private content from their own store, such as profile names, paths, or artifact text, and the agent adds `--yes` after they approve it. An issue on a public repository cannot be taken back.
- `ag issue` sends the category label only when the user can push to the target. GitHub keeps labels on a new issue only from someone with push access. For everyone else, `.github/workflows/triage-label.yml` adds `needs-triage`, and triage sets the category.

The issue forms remain the way to file a Core issue by hand. `blank_issues_enabled: false` makes a person pick a form, but it cannot stop an issue created through the API. The workflow labels those issues too.

## Considered Options

- **Issue forms only:** an agent can only hand the user a URL, and the forms stay unused whenever the work happens in an agent session, which is where `ag` refuses a Core edit.
- **The agent runs `gh issue create` itself:** it would have to find the repository and the body shape itself, and could skip the preview. Nothing would check its work.
- **A skill that describes how to file:** it would repeat `ag issue --help`, and an agent could still skip a step.
- **Always sending the label:** GitHub's handling of a label from someone without push access is not documented for `gh`. It might drop the label or reject the issue. Checking push access first gives the same result in both cases.
