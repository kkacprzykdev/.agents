import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const COMMAND = "artifacts/commands-core-me/core-grill.md";

// Sync links only tracked entries, so the Core-owner artifact is committed on main before the profile exists.
function addCoreOwnerCommand() {
  world.write(COMMAND, "grill\n");
  world.commitAll(world.store, "Add a Core-owner command");
  world.git(world.store, "push", "-q", "origin", "main");
}

function addUpstream() {
  world.git(world.store, "remote", "add", "upstream", "https://github.com/author/.agents");
}

function assertNotLinked() {
  assert.equal(world.exists(".cursor/commands/core-grill.md", world.home), false);
  assert.equal(world.exists(".claude/commands/core-grill.md", world.home), false);
  assert.match(ok(world.ag(["status"])), /Symlinks:\s+up to date/);
}

test("ag sync links Core-owner artifacts in a store that owns its Core", () => {
  addCoreOwnerCommand();
  createDefault(world);

  assert.equal(world.linkTarget(".cursor/commands/core-grill.md"), join(world.store, COMMAND));
  assert.equal(world.linkTarget(".claude/commands/core-grill.md"), join(world.store, COMMAND));
  assert.match(ok(world.ag(["status"])), /Symlinks:\s+up to date/);
});

test("ag sync does not link Core-owner artifacts in a store with an Upstream store, and removes earlier links", () => {
  addCoreOwnerCommand();
  createDefault(world);
  addUpstream();

  ok(world.ag(["sync"]));

  assertNotLinked();
});

test("a Clean profile links no Core-owner artifacts in either kind of store", () => {
  addCoreOwnerCommand();
  createDefault(world);
  ok(world.ag(["new", "bare", "--clean"]));
  ok(world.ag(["use", "bare"]));
  assertNotLinked();

  addUpstream();
  ok(world.ag(["sync"]));
  assertNotLinked();
});

test("a Core-owner artifact and a Store artifact with the same name stop ag sync and ag status", () => {
  addCoreOwnerCommand();
  createDefault(world);
  world.write("artifacts/commands-store-me/core-grill.md", "store copy\n");
  world.commitPastHook(world.store, "Add a Store artifact with the same name");

  const collision =
    /Collision: "core-grill\.md" comes from both "artifacts\/commands-store-me" and "artifacts\/commands-core-me"/;
  assert.match(fails(world.ag(["sync"])), collision);
  assert.match(fails(world.ag(["status"])), collision);
});

test("ag owner in a store with an Upstream store points a Core-owner artifact to the matching profile folder", () => {
  createDefault(world);
  addUpstream();

  const output = fails(world.ag(["owner", "artifacts/commands-core-me/core-grill.md"]));

  assert.match(output, /artifacts\/commands-core-me\/core-grill\.md is Core, which is read-only in this store/);
  assert.match(output, /goes in a profile: profiles\/default\/artifacts\/commands-profile-me\/core-grill\.md\n/);
});
