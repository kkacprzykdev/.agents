import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag owner names the owning branch and the checkout to edit", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  ok(world.ag(["edit", "default"]));
  world.write("skills/foo/SKILL.md", "foo\n", world.edit);
  world.commitAll(world.edit, "Add foo");
  ok(world.ag(["push"], { cwd: world.edit }));
  ok(world.ag(["update"]));

  assert.match(
    ok(world.ag(["owner", "profiles/default/references/shared.md"])),
    /Branch:\s+default\nCheckout: ~\/\.agents-edit/,
  );
  assert.match(
    ok(world.ag(["owner", "profiles/work/references/shared.md"])),
    /Branch:\s+work\nCheckout: ~\/\.agents\n/,
  );
  assert.match(ok(world.ag(["owner", "skills/foo/SKILL.md"])), /Branch:\s+default/);
  assert.match(ok(world.ag(["owner", "skills/bar/SKILL.md"])), /Branch:\s+work/);
  assert.match(ok(world.ag(["owner", join(world.store, "README.md")])), /Branch:\s+main/);
});

test("ag owner handles profile folders, the skills folder, unknown profiles, and ./ paths", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));

  assert.match(ok(world.ag(["owner", "profiles/default"])), /Branch:\s+default\n/);
  assert.match(ok(world.ag(["owner", "profiles/default/"])), /Branch:\s+default\n/);
  assert.match(ok(world.ag(["owner", "profiles/.env.active"])), /Branch:\s+work\n/);
  assert.match(ok(world.ag(["owner", "skills"])), /Branch:\s+work\n/);
  assert.match(ok(world.ag(["owner", ".skill-lock.json"])), /Branch:\s+work\n/);
  assert.match(fails(world.ag(["owner", "profiles/nope/x.md"])), /No profile "nope"/);
  assert.match(
    ok(world.ag(["owner", "./profiles/default/README.md"], { cwd: world.base })),
    /Branch:\s+default\n/,
  );

  ok(world.ag(["edit", "default"]));
  assert.match(
    ok(world.ag(["owner", "profiles/default/README.md"])),
    /Checkout: ~\/\.agents-edit \(already on default\)/,
  );
});

const caseInsensitive = existsSync(tmpdir().toUpperCase()) && existsSync(tmpdir().toLowerCase());

test("ag owner uses the on-disk letter case", { skip: !caseInsensitive }, () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  ok(world.ag(["edit", "default"]));
  world.write("skills/simplify/SKILL.md", "simplify\n", world.edit);
  world.commitAll(world.edit, "Add simplify");
  ok(world.ag(["update"]));
  world.write("profiles/work/references/shared.md", "work\n");
  world.commitAll(world.store, "Add work reference");

  assert.match(ok(world.ag(["owner", "Profiles/work/references/shared.md"])), /Branch:\s+work\n/);
  assert.match(ok(world.ag(["owner", "skills/Simplify/SKILL.md"])), /Branch:\s+default\n/);
});

test("ag owner finds a skill on origin's copy of an ancestor when the local branch is missing", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default", "--protect"]));
  ok(world.ag(["edit", "default"]));
  world.write("skills/foo/SKILL.md", "foo\n", world.edit);
  world.commitAll(world.edit, "Add foo");
  ok(world.ag(["update"]));
  world.git(world.store, "branch", "-D", "default");

  assert.match(ok(world.ag(["owner", "skills/foo/SKILL.md"])), /Branch:\s+default\n/);
});

test("ag owner follows a runtime symlink for a file that does not exist yet", () => {
  createDefault(world);
  world.write("skills/foo/SKILL.md", "foo\n");
  world.commitAll(world.store, "Add foo");
  ok(world.ag(["sync"]));

  assert.match(
    ok(world.ag(["owner", join(world.home, ".cursor/skills/foo/references/new.md")], { cwd: world.base })),
    /Branch:\s+default\n/,
  );
});

test("ag owner reports an unknown profile when origin cannot be reached", () => {
  createDefault(world);
  world.git(world.store, "remote", "set-url", "origin", "http://127.0.0.1:9/unreachable.git");

  assert.match(fails(world.ag(["owner", "profiles/nope/x.md"])), /No profile "nope"/);
  assert.match(ok(world.ag(["owner", "profiles/default/x.md"])), /Branch:\s+default\n/);
});

test("ag owner names main for Core paths when there is no Active profile", () => {
  assert.match(
    ok(world.ag(["owner", "sync/bin/ag.mjs"])),
    /Branch:\s+main\nCheckout: ~\/\.agents\n/,
  );
});

test("ag owner expands a ~\\ path, as cmd and PowerShell users type it", { skip: process.platform !== "win32" }, () => {
  assert.match(ok(world.ag(["owner", "~\\.agents\\sync\\bin\\ag.mjs"])), /Branch:\s+main\n/);
});

test("ag edit refuses when the Edit worktree has uncommitted changes", () => {
  createDefault(world);
  world.write("loose.txt", "loose\n", world.edit);

  assert.match(fails(world.ag(["edit", "main"])), /uncommitted changes/);
});

test("ag edit refuses the branch that is checked out in ~/.agents", () => {
  createDefault(world);

  assert.match(fails(world.ag(["edit", "default"])), /Edit it there/);
});
