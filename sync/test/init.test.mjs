import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const remote = (name) => world.git(world.store, "remote", "get-url", name);
const show = (repo, spec) => world.git(world.base, "--git-dir", repo, "show", spec);

// Another clone of the Upstream store, where its maintainer changes Core.
function pushUpstreamChange(file, content) {
  const maintainer = join(world.base, "maintainer");
  world.git(world.base, "clone", "-q", world.origin, maintainer);
  world.write(file, content, maintainer);
  world.commitAll(maintainer, `Upstream change to ${file}`);
  world.git(maintainer, "push", "-q", "origin", "main");
}

test("ag init with a URL takes Core from upstream and pushes to the user's own origin", () => {
  const mine = world.bareRepo("mine");

  const output = ok(world.ag(["init", mine]));

  assert.equal(remote("upstream"), world.origin);
  assert.equal(remote("origin"), mine);
  assert.equal(
    world.git(world.base, "--git-dir", mine, "rev-parse", "main"),
    world.git(world.store, "rev-parse", "main"),
  );
  assert.equal(world.git(world.store, "config", "branch.main.remote"), "origin");
  assert.equal(world.git(world.store, "config", "core.hooksPath"), ".githooks");
  assert.deepEqual(world.calls("npm").map((call) => call.args), [["link"]]);
  assert.match(output, /Next: ag new <name>/);
});

test("ag init without a URL creates a private repository with gh", () => {
  world.stub(
    "gh",
    `import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
appendFileSync(new URL("./gh.calls", import.meta.url), JSON.stringify({ args }) + "\\n");
if (args[0] === "repo" && args[1] === "create") {
  const path = fileURLToPath(new URL("../created.git", import.meta.url));
  spawnSync("git", ["init", "-q", "--bare", "-b", "main", path]);
  console.log(path);
}
`,
  );

  ok(world.ag(["init"]));

  assert.ok(world.calls("gh").some((call) => call.args.join(" ") === "repo create .agents --private"));
  assert.equal(remote("origin"), join(world.base, "created.git"));
  assert.equal(remote("upstream"), world.origin);
});

test("ag init without a URL or gh explains how to pass a URL and changes nothing", () => {
  assert.match(fails(world.ag(["init"])), /ag init <url>/);
  assert.equal(remote("origin"), world.origin);
});

test("ag init can be rerun with the right URL after a wrong one", () => {
  const mine = world.bareRepo("mine");

  assert.match(
    fails(world.ag(["init", join(world.base, "missing.git")])),
    /Run ag init <url> again with the right URL/,
  );
  ok(world.ag(["init", mine]));

  assert.equal(remote("upstream"), world.origin);
  assert.equal(remote("origin"), mine);
});

test("ag init refuses a store that already has profiles", () => {
  createDefault(world);

  assert.match(fails(world.ag(["init", world.bareRepo("mine")])), /fresh clone/);
  assert.equal(remote("origin"), world.origin);
});

test("ag update fast-forwards upstream main, pushes it to origin, and brings it down to profiles", () => {
  const mine = world.bareRepo("mine");
  ok(world.ag(["init", mine]));
  ok(world.ag(["new", "personal"]));
  pushUpstreamChange("core.txt", "from upstream\n");

  ok(world.ag(["update"]));

  assert.equal(world.read("core.txt"), "from upstream\n");
  assert.equal(show(mine, "main:core.txt"), "from upstream");
  assert.equal(show(mine, "personal:core.txt"), "from upstream");
  assert.equal(world.originHasBranch("personal"), false);
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("ag update refuses a main with commits of its own, then continues after the printed reset", () => {
  const mine = world.bareRepo("mine");
  ok(world.ag(["init", mine]));
  ok(world.ag(["new", "personal"]));
  world.write("core.txt", "mine\n", world.edit);
  world.commitAll(world.edit, "Change core.txt on my main");
  world.git(world.edit, "push", "-q", "origin", "main");
  pushUpstreamChange("core.txt", "upstream\n");

  const output = fails(world.ag(["update"]));

  assert.match(output, /main has commits that the Upstream store does not have:\n {2}\w+ Change core\.txt on my main/);
  assert.match(output, /git -C ~\/\.agents-edit reset --hard upstream\/main/);
  assert.match(output, /git -C ~\/\.agents-edit push --force-with-lease origin main/);
  assert.match(output, /An agent must ask the user/);
  assert.equal(world.originHas("personal", "core.txt"), false);
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");

  world.git(world.edit, "reset", "-q", "--hard", "upstream/main");
  world.git(world.edit, "push", "-q", "--force-with-lease", "origin", "main");
  ok(world.ag(["update"]));

  assert.equal(show(mine, "personal:core.txt"), "upstream");
  assert.equal(show(mine, "main:core.txt"), "upstream");
});

test("ag update refuses when only origin's main has commits of its own", () => {
  const mine = world.bareRepo("mine");
  ok(world.ag(["init", mine]));
  ok(world.ag(["new", "personal"]));
  const other = join(world.base, "other-computer");
  world.git(world.base, "clone", "-q", mine, other);
  world.write("core.txt", "other\n", other);
  world.commitAll(other, "Change core.txt on another computer");
  world.git(other, "push", "-q", "origin", "main");

  assert.match(fails(world.ag(["update"])), /\w+ Change core\.txt on another computer/);
});

test("Core is read-only in a store with an Upstream store, until upstream is removed", () => {
  const mine = world.bareRepo("mine");
  ok(world.ag(["init", mine]));
  ok(world.ag(["new", "personal"]));

  assert.ok(ok(world.ag(["status"])).includes(`Core:            read-only, from ${world.origin}`));
  const owner = fails(world.ag(["owner", "README.md"]));
  assert.match(owner, /README\.md is Core, which is read-only in this store/);
  assert.match(owner, /open an issue on/);
  assert.match(owner, /git -C ~\/\.agents remote remove upstream/);
  assert.match(
    fails(world.ag(["owner", "artifacts/rules-store-me/mine.mdc"])),
    /goes in a profile: profiles\/personal\/artifacts\/rules-profile-me\/mine\.mdc/,
  );
  assert.match(ok(world.ag(["owner", "profiles/personal/notes.md"])), /Branch:\s+personal\n/);
  assert.match(fails(world.ag(["edit", "main"])), /main is the Core branch, which is read-only in this store/);

  world.git(world.store, "remote", "remove", "upstream");

  assert.match(ok(world.ag(["status"])), /Core:\s+owned by this store/);
  assert.match(ok(world.ag(["owner", "README.md"])), /Branch:\s+main\n/);
  ok(world.ag(["edit", "main"]));
});
