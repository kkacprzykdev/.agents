import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const BUG = "### What happened\n\nag sync failed.\n\n### What you expected\n\nIt links.\n\n### OS\n\nmacOS\n";
const IDEA = "### Problem\n\nNo way to file.\n\n### Proposed change\n\nAdd one.\n";

// A signed-in gh that records its calls and answers the push-access query with `push`.
function stubGh(push) {
  world.stub(
    "gh",
    `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(new URL("./gh.calls", import.meta.url), JSON.stringify({ args }) + "\\n");
if (args[0] === "api") console.log("${push}");
if (args[0] === "issue") console.log("https://github.com/owner/repo/issues/7");
`,
  );
}

function bodyFile(content) {
  const path = join(world.base, "body.md");
  world.write("body.md", content, world.base);
  return path;
}

const issueCall = () => world.calls("gh").find((call) => call.args[0] === "issue")?.args;

test("ag issue without --yes previews the issue for this store and files nothing", () => {
  world.git(world.store, "remote", "set-url", "origin", "git@github.com:me/.agents.git");
  stubGh(true);

  const output = ok(world.ag(["issue", "bug", "--title", "Sync fails", "--body-file", bodyFile(BUG)]));

  assert.match(output, /Repository: github\.com\/me\/\.agents \(this store, which owns Core\)/);
  assert.match(output, /Title:\s+Sync fails/);
  assert.match(output, /  ### What happened/);
  assert.match(output, /run the same command with --yes/);
  assert.deepEqual(world.calls("gh"), []);
});

test("ag issue --yes files on this store with the category label when the user can push", () => {
  world.git(world.store, "remote", "set-url", "origin", "https://github.com/me/.agents.git");
  stubGh(true);
  const body = bodyFile(BUG);

  const output = ok(world.ag(["issue", "bug", "--title", "Sync fails", "--body-file", body, "--yes"]));

  assert.deepEqual(issueCall(), [
    "issue", "create", "-R", "github.com/me/.agents", "--title", "Sync fails", "--body-file", body, "--label", "bug",
  ]);
  assert.match(output, /issues\/7/);
});

test("ag issue files on the Upstream store, without a label when the user cannot push", () => {
  world.git(world.store, "remote", "set-url", "origin", "https://github.com/me/.agents.git");
  world.git(world.store, "remote", "add", "upstream", "https://github.com/author/.agents");
  stubGh(false);

  assert.match(
    ok(world.ag(["issue", "idea", "--title", "File issues", "--body-file", bodyFile(IDEA)])),
    /Repository: github\.com\/author\/\.agents \(the Upstream store, which owns Core\)/,
  );
  ok(world.ag(["issue", "idea", "--title", "File issues", "--body-file", bodyFile(IDEA), "--yes"]));

  const args = issueCall();
  assert.deepEqual(args.slice(0, 4), ["issue", "create", "-R", "github.com/author/.agents"]);
  assert.ok(!args.includes("--label"));
});

test("ag issue refuses a body without the form's headings and names them", () => {
  world.git(world.store, "remote", "set-url", "origin", "https://github.com/me/.agents.git");

  const missing = fails(world.ag(["issue", "bug", "--title", "x", "--body-file", bodyFile("### What happened\n\nx\n")]));
  assert.match(missing, /missing ### What you expected/);
  assert.match(missing, /### OS \(optional\)/);
  assert.match(
    fails(world.ag(["issue", "idea", "--title", "x", "--body-file", bodyFile(`${IDEA}\n### Steps\n\nx\n`)])),
    /unknown ### Steps/,
  );
});

test("ag issue refuses a non-GitHub remote, bad arguments, and a gh that is not signed in", () => {
  assert.match(
    fails(world.ag(["issue", "bug", "--title", "x", "--body-file", bodyFile(BUG)])),
    /is not a GitHub repository/,
  );
  assert.match(fails(world.ag(["issue", "feature", "--title", "x"])), /Usage: ag issue bug\|idea/);
  assert.match(fails(world.ag(["issue", "bug", "--body-file", bodyFile(BUG)])), /Usage: ag issue/);

  world.git(world.store, "remote", "set-url", "origin", "https://github.com/me/.agents.git");
  assert.match(
    fails(world.ag(["issue", "bug", "--title", "x", "--body-file", bodyFile(BUG), "--yes"])),
    /gh auth login/,
  );
});
