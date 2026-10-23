import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";
import { writes } from "./migrations.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag sync refuses with its own exit code when a migration is pending on this branch, before it checks for Blockers", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default"]));
  world.write("sync/migrations/0001-add-notes.mjs", writes("notes.md", "notes\n"));
  world.commitAll(world.store, "Take a migration without ag update");
  world.write("default-rule.md", "real file\n", join(world.home, ".claude/rules"));
  rmSync(join(world.home, ".cursor/rules/default-rule.mdc"));

  const result = world.ag(["sync"]);

  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Migration pending: these profiles are below migration level 1 of the Core in ~\/\.agents:\n  default 0\/1\n  work 0\/1\n/);
  assert.match(output, /Run `ag update`, or give this message to your coding agent\./);
  assert.doesNotMatch(output, /Blocker/);
  assert.equal(world.exists("default-rule.mdc", join(world.home, ".cursor/rules")), false);
});

test("ag sync warns and continues when a profile is above this branch's Core", () => {
  createDefault(world);
  world.write("profiles/default/profile.yaml", "parent: main\nlocal-files: [.env, .env.outputs]\nmigration-level: 2\n");
  world.commitAll(world.store, "Set a level by hand");

  const output = ok(world.ag(["sync"]));

  assert.match(output, /warning: these profiles are above migration level 0 of the Core in ~\/\.agents:\n  default 2\/0\n/);
  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
});

test("ag sync compares the levels with this checkout's Core, never with origin", () => {
  createDefault(world);
  const other = world.computer("other");
  other.write("sync/migrations/0001-add-notes.mjs", writes("notes.md", "notes\n"));
  other.commitAll(other.store, "Add a migration on another computer");
  other.git(other.store, "push", "-q", "origin", "main");
  world.git(world.store, "fetch", "-q", "origin");

  const output = ok(world.ag(["sync"]));

  assert.doesNotMatch(output, /migration/i);
});

test("ag status shows each Lineage profile's level against Core, and no line without an Active profile", () => {
  assert.doesNotMatch(ok(world.ag(["status"])), /Migration level/);
  createDefault(world);
  assert.match(ok(world.ag(["status"])), /^Migration level: default 0\/0$/m);
  ok(world.ag(["new", "work", "--from", "default"]));
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  ok(world.ag(["edit", "default"]));
  world.git(world.edit, "merge", "-q", "--no-edit", "main");
  world.write("profiles/default/profile.yaml", "parent: main\nlocal-files: [.env, .env.outputs]\nmigration-level: 1\n", world.edit);
  world.commitAll(world.edit, "Raise default by hand");
  world.git(world.store, "merge", "-q", "--no-edit", "default");

  assert.match(ok(world.ag(["status"])), /^Migration level: default 1\/1, work 0\/1 \(run ag update\)$/m);
});

test("migration numbers start at 0001, have no gaps, and never repeat", () => {
  createDefault(world);
  const status = (files) => {
    rmSync(join(world.store, "sync/migrations"), { recursive: true, force: true });
    for (const file of files) {
      world.write(`sync/migrations/${file}`, writes("notes.md", "notes\n"));
    }
    return world.ag(["status"]);
  };

  assert.match(ok(status([])), /^Migration level: default 0\/0$/m);
  assert.match(fails(status(["0002-late.mjs"])), /0002-late should be number 0001\. Numbers start at 0001 and have no gaps\./);
  assert.match(fails(status(["0001-a.mjs", "0003-c.mjs"])), /0003-c should be number 0002/);
  assert.match(fails(status(["0001-a.mjs", "0001-b.mjs"])), /0001-a and 0001-b share a number\. Renumber the newer one\./);
  assert.match(fails(status(["1-short.mjs"])), /1-short\.mjs is not a Profile migration\. Name it like 0001-move-rules\.mjs\./);
  assert.match(ok(status(["0001-a.mjs", "0002-b.mjs"])), /^Migration level: default 0\/2 \(run ag update\)$/m);
});

// A profile as it looked at migration level 0, before any Profile migration. Each real migration then also gets
// its own test from its previous level.
const LEVEL_0_PROFILE = join(import.meta.dirname, "fixtures/profile-level-0");

test("a stored level-0 profile goes through every real migration, and a second run changes nothing", () => {
  createDefault(world);
  rmSync(join(world.store, "profiles/default"), { recursive: true, force: true });
  cpSync(LEVEL_0_PROFILE, join(world.store, "profiles/default"), { recursive: true });
  world.commitAll(world.store, "Store a level-0 profile");
  world.write("profiles/default/.env", "HOME_PATH=/home/test\n");
  ok(world.ag(["push"]));

  ok(world.ag(["update"]));

  const [, level, core] = ok(world.ag(["status"])).match(/^Migration level: default (\d+)\/(\d+)$/m);
  assert.equal(level, core);
  assert.equal(/^migration-level:/m.test(world.read("profiles/default/profile.yaml")), core !== "0");
  assert.equal(world.read("profiles/default/.env"), "HOME_PATH=/home/test\n");
  const head = world.git(world.store, "rev-parse", "default");
  ok(world.ag(["update"]));
  assert.equal(world.git(world.store, "rev-parse", "default"), head);
});
