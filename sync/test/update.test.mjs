import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { createDefault, createSetupSkill, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

function createThreeLevels() {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  createSetupSkill(world, "work");
  ok(world.ag(["new", "clientx", "--from", "work"]));
}

test("ag update brings main down every level and pushes only branches that can be pushed", () => {
  createThreeLevels();
  ok(world.ag(["edit", "main"]));
  world.write("core.txt", "core change\n", world.edit);
  world.commitAll(world.edit, "Change Core");
  ok(world.ag(["push"], { cwd: world.edit }));

  ok(world.ag(["update"]));

  assert.equal(world.read("core.txt"), "core change\n");
  assert.ok(world.originHas("default", "core.txt"));
  assert.equal(world.git(world.store, "show", "work:core.txt"), "core change");
  assert.equal(world.originHasBranch("work"), false);
  assert.equal(world.originHasBranch("clientx"), false);
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("ag update adds no commits when every branch is up to date", () => {
  createThreeLevels();
  const shas = () => ["default", "work", "clientx"].map((branch) => world.git(world.store, "rev-parse", branch));
  const before = shas();

  ok(world.ag(["update"]));

  assert.deepEqual(shas(), before);
});

test("ag update stops on a conflict with git's output and the checkout, then continues after it is resolved", () => {
  createDefault(world);
  ok(world.ag(["edit", "main"]));
  world.write("shared.txt", "base\n", world.edit);
  world.commitAll(world.edit, "Add shared");
  ok(world.ag(["push"], { cwd: world.edit }));
  ok(world.ag(["update"]));
  world.write("shared.txt", "default\n");
  world.commitAll(world.store, "Change shared on default");
  ok(world.ag(["push"]));
  world.write("shared.txt", "main\n", world.edit);
  world.commitAll(world.edit, "Change shared on main");
  ok(world.ag(["push"], { cwd: world.edit }));

  const output = fails(world.ag(["update"]));

  assert.match(output, /CONFLICT/);
  assert.match(output, /Conflict in ~\/\.agents on branch default\./);
  assert.doesNotMatch(output, /resolving-merge-conflicts/);

  world.write("shared.txt", "resolved\n");
  world.git(world.store, "add", "shared.txt");
  world.git(world.store, "commit", "-q", "--no-edit");
  ok(world.ag(["update"]));
  assert.equal(world.git(world.base, "--git-dir", world.origin, "show", "default:shared.txt"), "resolved");
});

test("ag update refuses to start with uncommitted changes, and shows git's status for each checkout", () => {
  createDefault(world);
  world.write("loose.txt", "loose\n");
  world.write("edit-loose.txt", "loose\n", world.edit);

  const result = world.ag(["update"]);
  fails(result);

  assert.match(result.stdout, /\?\? loose\.txt/);
  assert.match(result.stdout, /\?\? edit-loose\.txt/);
  assert.match(
    result.stderr,
    /error: ~\/\.agents has uncommitted changes \(listed above\)\. Commit or discard them first\.\n.*error: ~\/\.agents-edit has uncommitted changes/s,
  );
});

test("ag update ignores a file just added to local-files instead of refusing", () => {
  createDefault(world);
  world.write("profiles/default/profile.yaml", "parent: main\nlocal-files: [.env, .env.outputs, secrets.json]\n");
  world.commitAll(world.store, "List secrets.json");
  world.write("profiles/default/secrets.json", "{}\n");

  ok(world.ag(["update"]));

  assert.equal(world.git(world.store, "status", "--porcelain"), "");
  assert.equal(world.originHas("default", "profiles/default/secrets.json"), false);
});

test("ag update pushes a main commit that was never pushed, then brings it down", () => {
  createDefault(world);
  ok(world.ag(["edit", "main"]));
  world.write("core.txt", "core change\n", world.edit);
  world.commitAll(world.edit, "Change Core");

  ok(world.ag(["update"]));

  assert.ok(world.originHas("main", "core.txt"));
  assert.equal(world.read("core.txt"), "core change\n");
});

test("after a conflict on an ancestor, the rerun ends with the Edit worktree on main", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  ok(world.ag(["edit", "main"]));
  world.write("shared.txt", "base\n", world.edit);
  world.commitAll(world.edit, "Add shared");
  ok(world.ag(["update"]));
  ok(world.ag(["edit", "default"]));
  world.write("shared.txt", "default\n", world.edit);
  world.commitAll(world.edit, "Change shared on default");
  ok(world.ag(["push"]));
  ok(world.ag(["edit", "main"]));
  world.write("shared.txt", "main\n", world.edit);
  world.commitAll(world.edit, "Change shared on main");
  ok(world.ag(["push"]));

  assert.match(fails(world.ag(["update"])), /Conflict in ~\/\.agents-edit on branch default\./);
  assert.match(fails(world.ag(["update"])), /error: ~\/\.agents-edit has a merge in progress\. Finish or abort it first\./);

  world.write("shared.txt", "resolved\n", world.edit);
  world.git(world.edit, "add", "shared.txt");
  world.git(world.edit, "commit", "-q", "--no-edit");
  ok(world.ag(["update"]));

  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
  assert.equal(world.read("shared.txt"), "resolved\n");
});

test("ag update and ag edit recover when the Edit worktree folder was deleted by hand", () => {
  createDefault(world);
  rmSync(world.edit, { recursive: true, force: true });

  ok(world.ag(["update"]));
  ok(world.ag(["edit", "main"]));

  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});
