import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok, oldAgSource, oldRuntimesSource } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const HANDOFF = /The ag on this branch differs from the running one, so ag use runs its ag sync\./;
const branch = () => world.git(world.store, "branch", "--show-current");

// A new profile whose ag only reports how it was called, then exits with the given status.
// The stub cannot run ag itself, so plain git pushes it and goes back to default.
function stubAgOn(profile, status) {
  ok(world.ag(["new", profile]));
  world.write("sync/bin/ag.mjs", `console.log("stub ag:", process.argv.slice(2).join(" "));\nprocess.exit(${status});\n`);
  world.commitAll(world.store, "Use a stub ag");
  world.git(world.store, "push", "-q", "origin", profile);
  world.git(world.store, "switch", "-q", "default");
}

test("ag use hands Sync to the switched branch's own ag when it differs, and runs no Update", () => {
  createDefault(world);
  stubAgOn("stubbed", 0);
  const head = world.git(world.store, "rev-parse", "stubbed");

  const output = ok(world.ag(["use", "stubbed"]));

  assert.match(output, HANDOFF);
  assert.match(output, /stub ag: sync\n/);
  assert.equal(branch(), "stubbed");
  assert.equal(world.git(world.store, "rev-parse", "stubbed"), head);
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("ag use syncs in its own process when the switched branch has the same ag", () => {
  createDefault(world);
  ok(world.ag(["new", "other"]));

  const output = ok(world.ag(["use", "default"]));

  assert.doesNotMatch(output, HANDOFF);
  assert.match(output, /Done — /);
});

test("ag use switches back to the previous branch when the switched branch's ag fails to sync", () => {
  createDefault(world);
  stubAgOn("broken", 1);

  const result = world.ag(["use", "broken"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /stub ag: sync/);
  assert.match(result.stdout, /Switched .* back to "default", because ag sync failed\. The agent homes are unchanged\./);
  assert.equal(branch(), "default");
});

test("ag use keeps the switch when the switched branch's ag says a migration is pending", () => {
  createDefault(world);
  stubAgOn("pending", 3);

  assert.equal(world.ag(["use", "pending"]).status, 3);
  assert.equal(branch(), "pending");
});

test("ag use switches back to the previous branch on a Blocker, and leaves the agent homes as they were", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default"]));
  world.write("profiles/work/artifacts/rules-profile-me/work-rule.mdc", "work rule\n");
  world.commitAll(world.store, "Add a work rule");
  ok(world.ag(["push"]));
  ok(world.ag(["use", "default"]));
  writeFileSync(join(world.home, ".cursor/rules/work-rule.mdc"), "real file\n");

  const output = fails(world.ag(["use", "work"]));

  assert.match(output, /Blocker: .*\n  ~\/\.cursor\/rules\/work-rule\.mdc \(rules\)/);
  assert.match(output, /Switched .* back to "default", because ag sync failed\./);
  assert.equal(branch(), "default");
  assert.equal(world.read("profiles/.env.active"), "ACTIVE_PROFILE=default\n");
  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
});

test("ag use keeps the switch and shows the refusal when a migration is pending, even with a Blocker", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default"]));
  world.addMigration("0001-noop.mjs", 'export function migrate() {\n  return { status: "done" };\n}\n');
  // A plain git merge takes main's migration without running it.
  world.git(world.store, "merge", "-q", "--no-edit", "main");
  ok(world.ag(["push"]));
  ok(world.ag(["use", "default"]));
  unlinkSync(join(world.home, ".cursor/rules/default-rule.mdc"));
  writeFileSync(join(world.home, ".cursor/rules/default-rule.mdc"), "real file\n");

  const result = world.ag(["use", "work"]);

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Migration pending: .*\n  default 0\/1\n  work 0\/1\n/);
  assert.equal(branch(), "work");
  assert.match(fails(world.ag(["update"])), /Blocker: .*\n  ~\/\.cursor\/rules\/default-rule\.mdc \(rules\)/);
  assert.match(world.read("profiles/work/profile.yaml"), /^migration-level: 1$/m);
});

test("an ag from before migrations fails on migration-level after switching, and then ag sync works", () => {
  createDefault(world);
  world.addMigration("0001-noop.mjs", 'export function migrate() {\n  return { status: "done" };\n}\n');
  ok(world.ag(["update"]));
  ok(world.ag(["new", "legacy"]));
  world.write("sync/bin/ag.mjs", oldAgSource());
  world.write("sync/runtimes.yaml", oldRuntimesSource());
  world.write("profiles/legacy/profile.yaml", "parent: main\n");
  rmSync(join(world.store, "sync/migrations"), { recursive: true, force: true });
  world.commitAll(world.store, "Go back to the ag from before migrations");
  ok(world.ag(["push"]));
  ok(world.ag(["sync"]));

  assert.match(fails(world.ag(["use", "default"])), /unknown key "migration-level"/);
  assert.equal(branch(), "default");

  ok(world.ag(["sync"]));
  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
});
