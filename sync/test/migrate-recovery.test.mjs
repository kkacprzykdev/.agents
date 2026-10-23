import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createDefault, createSetupSkill, createWorld, fails, ok } from "./world.mjs";
import { writes } from "./migrations.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

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
