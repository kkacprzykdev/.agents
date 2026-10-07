import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag new from main writes the skeleton, commits, pushes, and links store artifacts", () => {
  ok(world.ag(["new", "default"]));

  assert.equal(world.read("profiles/default/profile.yaml"), "parent: main\n");
  for (const kind of ["skills", "commands", "rules", "subagents"]) {
    assert.ok(world.exists(`profiles/default/artifacts/${kind}-profile-me/.gitkeep`));
  }
  assert.equal(world.read("profiles/.env.active"), "ACTIVE_PROFILE=default\n");
  assert.equal(world.git(world.store, "log", "-1", "--format=%s"), "Create profile `default`");
  assert.ok(world.originHasBranch("default"));
  assert.equal(
    world.linkTarget(".cursor/rules/store-rule.mdc"),
    join(world.store, "artifacts/rules-store-me/store-rule.mdc"),
  );
  assert.equal(
    world.linkTarget(".claude/rules/store-rule.md"),
    join(world.store, "artifacts/rules-store-me/store-rule.mdc"),
  );
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("ag new --from refuses a parent without a setup skill and prints the prompt", () => {
  ok(world.ag(["new", "default"]));

  const output = fails(world.ag(["new", "child", "--from", "default"]));

  assert.match(output, /Research the `default` profile/);
  assert.match(output, /setup-default\/SKILL\.md/);
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
  assert.equal(world.git(world.store, "branch", "--show-current"), "default");
});

test("ag new --from copies local files, keeps them ignored, inherits links, and names the setup skill", () => {
  createDefault(world);

  const output = ok(world.ag(["new", "child", "--from", "default"]));

  assert.match(output, /Created profile child\. Ask your agent to run the setup-default skill to configure it\./);
  assert.equal(
    world.read("profiles/child/profile.yaml"),
    "parent: default\nlocal-files: [.env, .env.outputs]\n",
  );
  assert.equal(world.read("profiles/child/.env"), "HOME_PATH=/home/test\n");
  assert.equal(world.git(world.store, "status", "--porcelain"), "");
  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
});

test("ag new refuses before creating anything when the Edit worktree has changes", () => {
  createDefault(world);
  world.write("loose.txt", "loose\n", world.edit);

  const result = world.ag(["new", "child", "--from", "default"]);
  fails(result);

  assert.match(result.stdout, /\?\? loose\.txt/);
  assert.match(result.stderr, /error: ~\/\.agents-edit has uncommitted changes \(listed above\)\. Commit or discard them first\./);
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
  assert.equal(world.originHasBranch("child"), false);
  assert.equal(world.git(world.store, "branch", "--show-current"), "default");
});

test("ag new refuses before creating anything when there is no origin remote", () => {
  createDefault(world);
  world.git(world.store, "remote", "remove", "origin");

  assert.match(fails(world.ag(["new", "child", "--from", "default"])), /error: no origin remote/);
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
});

test("ag new --protect keeps the new branch local", () => {
  createDefault(world);

  const output = ok(world.ag(["new", "work", "--from", "default", "--protect"]));

  assert.match(output, /work is local only/);
  assert.equal(world.originHasBranch("work"), false);
});
