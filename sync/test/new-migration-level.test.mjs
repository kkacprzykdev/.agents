import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const NOOP = 'export function migrate() {\n  return { status: "done" };\n}\n';
const STOP = 'export function migrate() {\n  return { status: "stop", instructions: "Decide.", commitMessage: "Decide" };\n}\n';
const syncRuns = (output) => output.match(/^info: Done — /gm)?.length ?? 0;
// profile.yaml as ag new committed it, before any migration commit.
const createdYaml = (name) => {
  const commit = world.git(world.store, "log", "--all", "--diff-filter=A", "--format=%H", "--", `profiles/${name}/profile.yaml`);
  return world.git(world.store, "show", `${commit}:profiles/${name}/profile.yaml`);
};

test("ag new writes the running ag's migration level, never 0, and syncs only once, at the end of its ag update", () => {
  createDefault(world);
  world.addMigration("0001-noop.mjs", NOOP);
  ok(world.ag(["update"]));

  const output = ok(world.ag(["new", "child", "--from", "default"]));
  ok(world.ag(["new", "bare", "--clean"]));

  assert.equal(syncRuns(output), 1);
  assert.ok(output.indexOf("info: Updating child") < output.indexOf("info: Active profile: child"));
  assert.equal(createdYaml("child"), "parent: default\nlocal-files: [.env, .env.outputs]\nmigration-level: 1");
  assert.equal(createdYaml("bare"), "parent: main\nclean: true\nmigration-level: 1");
  assert.equal(world.git(world.store, "log", "-1", "--format=%s", "bare"), "Create profile `bare`");
});

test("ag new reads the level before it switches, and its final ag update brings a parent that is behind level with it", () => {
  createDefault(world);
  ok(world.ag(["new", "other"]));
  world.addMigration("0001-noop.mjs", NOOP);
  ok(world.ag(["update"]));

  ok(world.ag(["new", "child", "--from", "default"]));

  assert.match(createdYaml("child"), /^migration-level: 1$/m);
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);
  assert.equal(
    world.git(world.store, "log", "-1", "--format=%s", "default"),
    "Run Profile migration 0001-noop on `default`",
  );
});

test("ag new from an ag that is behind main leaves the level out, and its final ag update migrates the new profile", () => {
  createDefault(world);
  world.addMigration("0001-noop.mjs", NOOP);

  ok(world.ag(["new", "fresh"]));

  assert.equal(createdYaml("fresh"), "parent: main");
  assert.match(world.read("profiles/fresh/profile.yaml"), /^migration-level: 1$/m);
});

test("when the final ag update of ag new stops, Sync refuses a new profile that is behind and warns about one that is ahead", () => {
  createDefault(world);
  ok(world.ag(["new", "other"]));
  world.addMigration("0001-stop.mjs", STOP);

  assert.match(fails(world.ag(["new", "behind"])), /Profile migration 0001-stop stopped on branch behind/);
  assert.equal(world.ag(["sync"]).status, 3);

  assert.match(fails(world.ag(["new", "ahead", "--from", "default"])), /stopped on branch default in ~\/\.agents-edit/);
  assert.match(world.read("profiles/ahead/profile.yaml"), /^migration-level: 1$/m);
  assert.match(ok(world.ag(["sync"])), /above migration level 0 of the Core in ~\/\.agents:\n  ahead 1\/0\n/);
});
