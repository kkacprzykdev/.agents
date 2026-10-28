import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import {
  CURRENT_AG,
  CURRENT_RUNTIMES,
  createDefault,
  createSetupSkill,
  createWorld,
  ok,
  oldAgSource,
  oldRuntimesSource,
} from "./world.mjs";
import { writes, writesOwnPath } from "./migrations.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

// The subjects of the migration commits in a range, newest first.
const migrationCommits = (cwd, range) =>
  world.git(cwd, "log", "--format=%s", range).split("\n").filter((subject) => subject.startsWith("Run Profile migration"));

test("ag update runs each pending migration on the Active profile, with one commit that raises its level", () => {
  createDefault(world);
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  world.addMigration("0002-add-todo.mjs", writes("todo.md", "todo\n"));
  const before = world.git(world.store, "rev-parse", "default");

  ok(world.ag(["update"]));

  assert.equal(world.read("profiles/default/notes.md"), "notes\n");
  assert.equal(world.read("profiles/default/todo.md"), "todo\n");
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 2$/m);
  assert.deepEqual(migrationCommits(world.store, `${before}..default`), [
    "Run Profile migration 0002-add-todo on `default`",
    "Run Profile migration 0001-add-notes on `default`",
  ]);
  assert.equal(world.git(world.store, "show", "default~1:profiles/default/profile.yaml").includes("migration-level: 1"), true);
  assert.equal(world.git(world.store, "status", "--porcelain"), "");
  assert.ok(world.originHas("default", "profiles/default/todo.md"));
  assert.equal(world.read("profiles/default/.env"), "HOME_PATH=/home/test\n");

  const head = world.git(world.store, "rev-parse", "default");
  ok(world.ag(["update"]));
  assert.equal(world.git(world.store, "rev-parse", "default"), head);
});

test("each Lineage branch runs only its missing migrations on its own folder, after merging its parent", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  createSetupSkill(world, "work");
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  ok(world.ag(["update"]));
  assert.match(world.read("profiles/work/profile.yaml"), /^migration-level: 1$/m);
  assert.equal(world.git(world.store, "show", "default:profiles/default/profile.yaml").includes("migration-level: 1"), true);
  world.addMigration("0002-add-todo.mjs", writesOwnPath("todo.md"));
  const before = { default: world.git(world.store, "rev-parse", "default"), work: world.git(world.store, "rev-parse", "work") };

  const output = ok(world.ag(["update"]));

  assert.deepEqual(migrationCommits(world.store, `${before.default}..default`), [
    "Run Profile migration 0002-add-todo on `default`",
  ]);
  assert.deepEqual(migrationCommits(world.store, `${before.work}..work`), [
    "Run Profile migration 0002-add-todo on `work`",
    "Run Profile migration 0002-add-todo on `default`",
  ]);
  assert.match(output, /Running Profile migration 0002-add-todo on default in ~\/\.agents-edit/);
  assert.match(output, /Running Profile migration 0002-add-todo on work in ~\/\.agents\n/);
  assert.equal(world.read("profiles/default/todo.md"), join(world.edit, "sync/migrations/0002-add-todo.mjs"));
  assert.equal(world.read("profiles/work/todo.md"), join(world.store, "sync/migrations/0002-add-todo.mjs"));
  assert.deepEqual(world.git(world.store, "show", "--name-only", "--format=", "work").split("\n"), [
    "profiles/work/profile.yaml",
    "profiles/work/todo.md",
  ]);
  assert.ok(world.originHas("default", "profiles/default/todo.md"));
  assert.equal(world.originHasBranch("work"), false);
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("ag update runs the migrations with the ag that was just merged, not the older one that started it", () => {
  world.cleanup();
  world = createWorld({ agSource: oldAgSource(), runtimesSource: oldRuntimesSource() });
  createDefault(world);
  ok(world.ag(["edit", "main"]));
  world.write("sync/bin/ag.mjs", CURRENT_AG, world.edit);
  world.write("sync/runtimes.yaml", CURRENT_RUNTIMES, world.edit);
  world.write("sync/migrations/0001-add-notes.mjs", writes("notes.md", "notes\n"), world.edit);
  world.commitAll(world.edit, "Ship Profile migrations");
  world.git(world.edit, "push", "-q", "origin", "main");

  const output = ok(world.ag(["update"]));

  assert.match(output, /Continuing this update with the ag that was just merged\./);
  assert.equal(world.read("profiles/default/notes.md"), "notes\n");
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);
});

test("a computer that pulls an already migrated branch runs nothing", () => {
  createDefault(world);
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  ok(world.ag(["update"]));
  const other = world.computer("other");
  ok(other.ag(["use", "default"]));
  const head = other.git(other.store, "rev-parse", "default");

  const output = ok(other.ag(["update"]));

  assert.doesNotMatch(output, /Running Profile migration/);
  assert.equal(other.git(other.store, "rev-parse", "default"), head);
  assert.equal(other.read("profiles/default/notes.md"), "notes\n");
});

test("two computers that migrate the same branch make the same files, and their commits merge without a conflict", () => {
  createDefault(world);
  const other = world.computer("other");
  ok(other.ag(["use", "default"]));
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  // The other computer migrates from a copy of origin taken before this computer pushes its migration.
  const offline = join(world.base, "offline.git");
  cpSync(world.origin, offline, { recursive: true });
  other.git(other.store, "remote", "set-url", "origin", offline);

  ok(world.ag(["update"]));
  ok(other.ag(["update"]));

  const tree = (git, store) => git(store, "rev-parse", "default^{tree}");
  assert.equal(tree(other.git, other.store), tree(world.git, world.store));
  assert.notEqual(other.git(other.store, "rev-parse", "default"), world.git(world.store, "rev-parse", "default"));
  other.git(other.store, "remote", "set-url", "origin", world.origin);
  const output = ok(other.ag(["update"]));
  assert.doesNotMatch(output, /CONFLICT|Running Profile migration/);
  assert.equal(tree(other.git, other.store), tree(world.git, world.store));
});

test("migration commits pass the pre-commit hook of a store with an Upstream store", () => {
  createDefault(world);
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  world.git(world.store, "remote", "add", "upstream", world.origin);
  assert.equal(world.git(world.store, "config", "core.hooksPath"), ".githooks");

  ok(world.ag(["update"]));

  assert.equal(world.git(world.store, "log", "-1", "--format=%s"), "Run Profile migration 0001-add-notes on `default`");
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);
});
