import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag sync refuses on main", () => {
  assert.match(fails(world.ag(["sync"])), /No Active profile/);
});

test("ag sync stops on a name collision within the Lineage", () => {
  createDefault(world);
  ok(world.ag(["new", "child", "--from", "default"]));
  world.write("profiles/child/artifacts/rules-profile-me/default-rule.mdc", "copy\n");

  assert.match(fails(world.ag(["sync"])), /Collision: "default-rule\.mdc"/);
});

test("ag sync stops on a blocking file before it removes any link", () => {
  createDefault(world);
  const blocked = join(world.home, ".cursor/rules/default-rule.mdc");
  unlinkSync(blocked);
  writeFileSync(blocked, "real file\n");

  assert.match(fails(world.ag(["sync"])), /Blocker: .*changed nothing:\n  ~\/\.cursor\/rules\/default-rule\.mdc \(rules\)/);
  assert.equal(
    world.linkTarget(".cursor/rules/store-rule.mdc"),
    join(world.store, "artifacts/rules-store-me/store-rule.mdc"),
  );
});

test("ag sync checks every runtime before it changes any, and lists every Blocker", () => {
  createDefault(world);
  world.write("profiles/default/artifacts/rules-profile-me/new-rule.mdc", "new rule\n");
  world.write("profiles/default/artifacts/skills-profile-me/new-skill/SKILL.md", "new skill\n");
  writeFileSync(join(world.home, ".claude/rules/new-rule.md"), "real file\n");
  world.write("new-skill/SKILL.md", "real folder\n", join(world.home, ".claude/skills"));

  const output = fails(world.ag(["sync"]));

  assert.match(output, /~\/\.claude\/rules\/new-rule\.md \(rules\)/);
  assert.match(output, /~\/\.claude\/skills\/new-skill \(skills\)/);
  assert.equal(world.exists(".cursor/rules/new-rule.mdc", world.home), false);
  assert.equal(world.read(".claude/rules/new-rule.md", world.home), "real file\n");
});

test("ag sync warns about real artifacts it does not manage, keeps them, and links the rest", () => {
  createDefault(world);
  world.write("my-skill/SKILL.md", "mine\n", join(world.home, ".cursor/skills"));
  world.write(".hidden-note", "hidden\n", join(world.home, ".cursor/rules"));

  const output = ok(world.ag(["sync"]));

  assert.match(
    output,
    /ag does not manage these real files or folders in agent homes:\n  ~\/\.cursor\/skills\/my-skill \(move into profiles\/default\/artifacts\/skills-profile-me\/ to manage it\)/,
  );
  assert.doesNotMatch(output, /\.hidden-note/);
  assert.equal(world.read(".cursor/skills/my-skill/SKILL.md", world.home), "mine\n");
  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
});

test("ag sync reads runtimes.yaml and profile.yaml with Windows line endings", () => {
  createDefault(world);
  const crlf = (text) => text.replace(/\r?\n/g, "\r\n");
  world.write("sync/runtimes.yaml", crlf(world.read("sync/runtimes.yaml")));
  world.write("profiles/default/profile.yaml", crlf(world.read("profiles/default/profile.yaml")));

  ok(world.ag(["sync"]));

  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
});

test("ag sync treats names that differ only in letter case as a collision", () => {
  createDefault(world);
  world.write("artifacts/rules-store-me/Default-Rule.mdc", "store copy\n");

  assert.match(fails(world.ag(["sync"])), /Collision: "default-rule\.mdc"/i);
});

test("ag sync does not link desktop.ini or Thumbs.db", () => {
  createDefault(world);
  world.write("profiles/default/artifacts/rules-profile-me/desktop.ini", "");
  world.write("profiles/default/artifacts/rules-profile-me/Thumbs.db", "");

  ok(world.ag(["sync"]));

  assert.equal(world.exists("desktop.ini", join(world.home, ".cursor/rules")), false);
  assert.equal(world.exists("Thumbs.db", join(world.home, ".cursor/rules")), false);
});

// Windows ignores chmod on folders, and root ignores folder permissions.
const canDenyWrites = process.platform !== "win32" && process.getuid?.() !== 0;

test("ag sync stops before it removes any link when it cannot create links", { skip: !canDenyWrites }, () => {
  createDefault(world);
  const rules = join(world.home, ".cursor/rules");
  chmodSync(rules, 0o555);
  try {
    assert.match(fails(world.ag(["sync"])), /Cannot create links in .*rules/);
    assert.equal(
      world.linkTarget(".cursor/rules/default-rule.mdc"),
      join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
    );
  } finally {
    chmodSync(rules, 0o755);
  }
});

test("ag use detaches the Edit worktree when ~/.agents holds main and the worktree holds the profile", () => {
  createDefault(world);
  ok(world.ag(["new", "work", "--from", "default"]));
  ok(world.ag(["edit", "default"]));
  world.git(world.store, "switch", "-q", "main");

  ok(world.ag(["use", "default"]));

  assert.equal(world.git(world.store, "branch", "--show-current"), "default");
  assert.equal(world.git(world.edit, "branch", "--show-current"), "");
  ok(world.ag(["edit", "main"]));
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("the store's .gitignore ignores env files but keeps templates and the Active profile file", () => {
  const ignored = (path) =>
    spawnSync("git", ["-C", REPO, "check-ignore", "-q", "--no-index", path], {
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    }).status === 0;

  assert.ok(ignored("profiles/work/.env"));
  assert.ok(ignored("profiles/work/.env.jira"));
  assert.ok(!ignored("profiles/default/.env.example"));
  assert.ok(!ignored("profiles/default/.env.outputs.example"));
  assert.ok(!ignored("profiles/.env.active"));
});

test("ag use refuses main and creates a missing branch from origin", () => {
  createDefault(world);
  ok(world.ag(["new", "other"]));
  world.git(world.store, "branch", "-D", "default");

  assert.match(fails(world.ag(["use", "main"])), /ag edit main/);
  ok(world.ag(["use", "default"]));
  assert.equal(world.git(world.store, "branch", "--show-current"), "default");
  assert.equal(world.read("profiles/.env.active"), "ACTIVE_PROFILE=default\n");
});
