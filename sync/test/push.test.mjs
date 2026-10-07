import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createDefault, createWorld, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag push pushes a branch with no protected profile, from the checkout it runs in", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  ok(world.ag(["edit", "default"]));
  world.write("note.txt", "from default\n", world.edit);
  world.commitAll(world.edit, "Add note");

  ok(world.ag(["push"], { cwd: world.edit }));

  assert.ok(world.originHas("default", "note.txt"));
});

test("ag push pushes the Edit worktree's branch from any directory", () => {
  createDefault(world);
  ok(world.ag(["edit", "main"]));
  world.write("core.txt", "core\n", world.edit);
  world.commitAll(world.edit, "Change Core");

  ok(world.ag(["push"], { cwd: world.base }));

  assert.ok(world.originHas("main", "core.txt"));
});

test("ag push keeps a branch local when its unpushed history holds a protected profile", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  world.git(world.store, "switch", "-q", "-c", "spinoff");
  world.git(world.store, "rm", "-r", "-q", "profiles/work");
  world.git(world.store, "commit", "-q", "-m", "Drop work");

  assert.match(ok(world.ag(["push"])), /spinoff is local only/);
  assert.equal(world.originHasBranch("spinoff"), false);
});

test("ag push leaves a branch local when its Lineage has a protected profile", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  world.write("profiles/work/note.txt", "private\n");
  world.commitAll(world.store, "Add private note");

  assert.match(ok(world.ag(["push"])), /work is local only/);
  assert.equal(world.originHasBranch("work"), false);
});
