import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_AG, createDefault, createSetupSkill, createWorld, fails, ok, oldAgSource } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

// A migration that writes one file into the profile folder. Writing the same content again changes nothing.
function writes(rel, content) {
  return `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function migrate(profileDir) {
  const path = join(profileDir, ${JSON.stringify(rel)});
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, ${JSON.stringify(content)});
  return { status: "done" };
}
`;
}

// A migration that records the path it was loaded from, to show which checkout's Core ran it.
function writesOwnPath(rel) {
  return `import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function migrate(profileDir) {
  writeFileSync(join(profileDir, ${JSON.stringify(rel)}), fileURLToPath(import.meta.url));
  return { status: "done" };
}
`;
}

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
  world = createWorld({ agSource: oldAgSource() });
  createDefault(world);
  ok(world.ag(["edit", "main"]));
  world.write("sync/bin/ag.mjs", CURRENT_AG, world.edit);
  world.write("sync/migrations/0001-add-notes.mjs", writes("notes.md", "notes\n"), world.edit);
  world.commitAll(world.edit, "Ship Profile migrations");
  world.git(world.edit, "push", "-q", "origin", "main");

  const output = ok(world.ag(["update"]));

  assert.match(output, /Continuing this update with the ag that was just merged\./);
  assert.equal(world.read("profiles/default/notes.md"), "notes\n");
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);
});

// Renames old.md to new.md, which is safe, then needs a person to write decision.md.
const NEEDS_DECISION = `import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

export function migrate(profileDir) {
  if (existsSync(join(profileDir, "old.md"))) {
    renameSync(join(profileDir, "old.md"), join(profileDir, "new.md"));
  }
  if (!existsSync(join(profileDir, "decision.md"))) {
    return {
      status: "stop",
      instructions: "Write profiles/default/decision.md with the layout you chose.",
      commitMessage: "Choose the new layout",
    };
  }
  return { status: "done" };
}
`;

test("a migration that stops keeps its partial change uncommitted, and the rerun finishes after the step is committed", () => {
  createDefault(world);
  world.write("profiles/default/old.md", "old\n");
  world.commitAll(world.store, "Add old.md");
  ok(world.ag(["push"]));
  world.addMigration("0001-choose-layout.mjs", NEEDS_DECISION);

  const output = fails(world.ag(["update"]));

  assert.match(output, /Profile migration 0001-choose-layout stopped on branch default in ~\/\.agents\./);
  assert.match(output, /Write profiles\/default\/decision\.md with the layout you chose\./);
  assert.match(output, /Then commit in ~\/\.agents with this message:\n  Choose the new layout\nthen run `ag update`\./);
  assert.match(output, /Follow these steps, or give this message to your coding agent\./);
  assert.equal(world.exists("profiles/default/new.md"), true);
  assert.equal(world.exists("profiles/default/old.md"), false);
  assert.doesNotMatch(world.read("profiles/default/profile.yaml"), /migration-level/);
  assert.notEqual(world.git(world.store, "status", "--porcelain"), "");

  assert.match(fails(world.ag(["update"])), /~\/\.agents has uncommitted changes/);
  world.write("profiles/default/decision.md", "flat\n");
  world.commitAll(world.store, "Choose the new layout");
  ok(world.ag(["update"]));

  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);
  assert.equal(world.git(world.store, "log", "-1", "--format=%s"), "Run Profile migration 0001-choose-layout on `default`");
  assert.deepEqual(world.git(world.store, "show", "--name-only", "--format=", "HEAD").split("\n"), ["profiles/default/profile.yaml"]);
  assert.ok(world.originHas("default", "profiles/default/decision.md"));
});

// Changes, deletes, and creates files in the profile folder, then fails like a bug.
const CRASHES = `import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function migrate(profileDir) {
  writeFileSync(join(profileDir, "notes.md"), "half done\\n");
  rmSync(join(profileDir, "artifacts/rules-profile-me/default-rule.mdc"));
  mkdirSync(join(profileDir, "draft"));
  writeFileSync(join(profileDir, "draft/new.md"), "new\\n");
  throw new Error("bug in the migration");
}
`;

test("a migration that crashes puts the profile folder back, keeps local files, and keeps earlier levels", () => {
  createDefault(world);
  world.addMigration("0001-add-notes.mjs", writes("notes.md", "notes\n"));
  world.addMigration("0002-crash.mjs", CRASHES);

  const output = fails(world.ag(["update"]));

  assert.match(output, /Profile migration 0002-crash failed on branch default in ~\/\.agents:/);
  assert.match(output, /bug in the migration/);
  assert.equal(world.git(world.store, "status", "--porcelain"), "");
  assert.equal(world.read("profiles/default/notes.md"), "notes\n");
  assert.equal(world.read("profiles/default/artifacts/rules-profile-me/default-rule.mdc"), "default rule\n");
  assert.equal(world.exists("profiles/default/draft"), false);
  assert.equal(world.read("profiles/default/.env"), "HOME_PATH=/home/test\n");
  assert.equal(world.read("profiles/default/.env.outputs"), "fallback=~/.scratch\n");
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);

  assert.match(fails(world.ag(["update"])), /Profile migration 0002-crash failed/);
  assert.match(world.read("profiles/default/profile.yaml"), /^migration-level: 1$/m);
});

// Done on every profile but work. On work it breaks profile.yaml, adds files next to a local file, then fails.
const CRASHES_ON_WORK = `import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export function migrate(profileDir) {
  if (basename(profileDir) !== "work") {
    return { status: "done" };
  }
  writeFileSync(join(profileDir, "profile.yaml"), "broken\\n");
  mkdirSync(join(profileDir, "secrets/draft"));
  writeFileSync(join(profileDir, "secrets/draft/new.md"), "new\\n");
  throw new Error("bug in the migration");
}
`;

test("a crash on a child profile leaves nested local files, the parent's folder, skills/ and .git as they were", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default"]));
  createSetupSkill(world, "work");
  world.write("profiles/work/profile.yaml", "parent: default\nlocal-files: [secrets/key.env]\n");
  world.write("skills/third-party/SKILL.md", "skill\n");
  world.commitAll(world.store, "Add a nested local file and a third-party skill");
  ok(world.ag(["push"]));
  world.write("profiles/work/secrets/key.env", "KEY=1\n");
  world.addMigration("0001-crash-on-work.mjs", CRASHES_ON_WORK);

  assert.match(fails(world.ag(["update"])), /Profile migration 0001-crash-on-work failed on branch work in ~\/\.agents:/);

  assert.equal(world.git(world.store, "status", "--porcelain"), "");
  assert.equal(world.read("profiles/work/profile.yaml"), "parent: default\nlocal-files: [secrets/key.env]\n");
  assert.equal(world.read("profiles/work/secrets/key.env"), "KEY=1\n");
  assert.equal(world.exists("profiles/work/secrets/draft"), false);
  assert.equal(world.read("skills/third-party/SKILL.md"), "skill\n");
  assert.equal(
    world.git(world.store, "rev-parse", "HEAD:profiles/default"),
    world.git(world.store, "rev-parse", "default:profiles/default"),
  );
  assert.match(world.read(".git/info/exclude"), /^\/profiles\/work\/secrets\/key\.env$/m);
  assert.equal(world.git(world.store, "branch", "--show-current"), "work");
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
