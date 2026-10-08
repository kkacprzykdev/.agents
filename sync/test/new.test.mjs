import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

const INSTRUCTIONS = "profiles/default/artifacts/instructions-profile-me";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag new from main writes the skeleton, commits, pushes, and links store artifacts", () => {
  ok(world.ag(["new", "default"]));

  assert.equal(world.read("profiles/default/profile.yaml"), "parent: main\n");
  for (const kind of ["skills", "commands", "rules", "subagents"]) {
    assert.ok(world.exists(`profiles/default/artifacts/${kind}-profile-me/.gitkeep`));
  }
  assert.deepEqual(readdirSync(join(world.store, INSTRUCTIONS)).sort(), ["AGENTS.md", "CLAUDE.md"]);
  assert.equal(world.read(`${INSTRUCTIONS}/AGENTS.md`), "");
  assert.equal(world.read(`${INSTRUCTIONS}/CLAUDE.md`), "@~/.claude/AGENTS.md\n");
  assert.equal(world.linkTarget(".claude/CLAUDE.md"), join(world.store, INSTRUCTIONS, "CLAUDE.md"));
  assert.equal(world.read("profiles/.env.active"), "ACTIVE_PROFILE=default\n");
  assert.equal(world.git(world.store, "log", "-1", "--format=%s"), "Create profile `default`");
  assert.ok(world.originHasBranch("default"));
  assert.equal(
    world.linkTarget(".cursor/rules/store-rule.mdc"),
    join(world.store, "artifacts/rules-store-me/store-rule.mdc"),
  );
  assert.equal(
    world.linkTarget(".claude/rules/store-rule.md"),
    join(world.store, "artifacts/rules-store-me/store-rule.mdc"),
  );
  assert.equal(world.git(world.edit, "branch", "--show-current"), "main");
});

test("ag new --from refuses a parent without a setup skill and prints the prompt", () => {
  ok(world.ag(["new", "default"]));

  const output = fails(world.ag(["new", "child", "--from", "default"]));

  assert.match(output, /Research the `default` profile/);
  assert.match(output, /setup-default\/SKILL\.md/);
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
  assert.equal(world.git(world.store, "branch", "--show-current"), "default");
});

test("ag new --from copies local files, keeps them ignored, inherits links, and names the setup skill", () => {
  createDefault(world);

  const output = ok(world.ag(["new", "child", "--from", "default"]));

  assert.match(output, /Created profile child\. Ask your agent to run the setup-default skill to configure it\./);
  assert.equal(
    world.read("profiles/child/profile.yaml"),
    "parent: default\nlocal-files: [.env, .env.outputs]\n",
  );
  assert.equal(world.read("profiles/child/.env"), "HOME_PATH=/home/test\n");
  assert.equal(world.git(world.store, "status", "--porcelain"), "");
  assert.equal(
    world.linkTarget(".cursor/rules/default-rule.mdc"),
    join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"),
  );
  assert.deepEqual(readdirSync(join(world.store, "profiles/child/artifacts/instructions-profile-me")), [".gitkeep"]);
  assert.equal(world.linkTarget(".claude/AGENTS.md"), join(world.store, INSTRUCTIONS, "AGENTS.md"));
});

test("ag new refuses before creating anything when a real global instruction file would block ag sync", () => {
  mkdirSync(join(world.home, ".codex"));
  writeFileSync(join(world.home, ".claude/CLAUDE.md"), "mine\n");
  writeFileSync(join(world.home, ".codex/AGENTS.md"), "mine\n");
  writeFileSync(join(world.home, ".cursor/AGENTS.md"), "cursor reads no global AGENTS.md\n");

  const output = fails(world.ag(["new", "default"]));

  assert.match(output, /These real global instruction files would block ag sync, so ag new changed nothing:/);
  assert.match(output, /  ~\/\.claude\/CLAUDE\.md\n  ~\/\.codex\/AGENTS\.md\n/);
  assert.doesNotMatch(output, /\.cursor/);
  assert.match(output, /Rename each one, for example to CLAUDE\.md\.old\./);
  assert.equal(world.git(world.store, "branch", "--list", "default"), "");
  assert.equal(world.git(world.store, "branch", "--show-current"), "main");
  assert.equal(world.exists("profiles"), false);

  renameSync(join(world.home, ".claude/CLAUDE.md"), join(world.home, ".claude/CLAUDE.md.old"));
  rmSync(join(world.home, ".codex/AGENTS.md"));
  symlinkSync(join(world.home, ".claude/CLAUDE.md.old"), join(world.home, ".codex/CLAUDE.md"));

  ok(world.ag(["new", "default"]));
  assert.equal(world.linkTarget(".codex/CLAUDE.md"), join(world.store, INSTRUCTIONS, "CLAUDE.md"));
});

test("ag new from a parent checks only the instruction files its Lineage has, and a clean profile checks none", () => {
  createDefault(world);
  world.git(world.store, "rm", "-q", `${INSTRUCTIONS}/CLAUDE.md`);
  world.commitAll(world.store, "Drop CLAUDE.md");
  ok(world.ag(["push"]));
  ok(world.ag(["sync"]));
  writeFileSync(join(world.home, ".claude/CLAUDE.md"), "mine\n");

  ok(world.ag(["new", "child", "--from", "default"]));

  rmSync(join(world.home, ".claude/AGENTS.md"));
  writeFileSync(join(world.home, ".claude/AGENTS.md"), "mine\n");
  ok(world.ag(["new", "clean", "--clean"]));
  assert.deepEqual(readdirSync(join(world.store, "profiles/clean/artifacts/instructions-profile-me")), [".gitkeep"]);
});

test("ag new from a parent refuses when the Lineage has an instruction file that a real file would block", () => {
  createDefault(world);
  rmSync(join(world.home, ".claude/CLAUDE.md"));
  writeFileSync(join(world.home, ".claude/CLAUDE.md"), "mine\n");

  assert.match(
    fails(world.ag(["new", "child", "--from", "default"])),
    /would block ag sync, so ag new changed nothing:\n  ~\/\.claude\/CLAUDE\.md\n/,
  );
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
});

test("ag new refuses before creating anything when the Edit worktree has changes", () => {
  createDefault(world);
  world.write("loose.txt", "loose\n", world.edit);

  const result = world.ag(["new", "child", "--from", "default"]);
  fails(result);

  assert.match(result.stdout, /\?\? loose\.txt/);
  assert.match(result.stderr, /error: ~\/\.agents-edit has uncommitted changes \(listed above\)\. Commit or discard them first\./);
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
  assert.equal(world.originHasBranch("child"), false);
  assert.equal(world.git(world.store, "branch", "--show-current"), "default");
});

test("ag new refuses before creating anything when there is no origin remote", () => {
  createDefault(world);
  world.git(world.store, "remote", "remove", "origin");

  assert.match(fails(world.ag(["new", "child", "--from", "default"])), /error: no origin remote/);
  assert.equal(world.git(world.store, "branch", "--list", "child"), "");
});

test("ag new --clean creates a profile that links nothing, not even store artifacts", () => {
  createDefault(world);
  assert.ok(world.linkTarget(".cursor/rules/store-rule.mdc"));

  ok(world.ag(["new", "clean", "--clean"]));

  assert.equal(world.read("profiles/clean/profile.yaml"), "parent: main\nclean: true\n");
  assert.ok(world.originHasBranch("clean"));
  for (const target of [".cursor/rules", ".cursor/skills", ".claude/rules", ".claude/skills"]) {
    assert.deepEqual(readdirSync(join(world.home, target)), [], target);
  }
  assert.match(ok(world.ag(["status"])), /Symlinks: +up to date/);
});

test("ag new --clean refuses --from, because a clean profile starts from main", () => {
  createDefault(world);

  assert.match(
    fails(world.ag(["new", "clean", "--clean", "--from", "default"])),
    /A clean profile is created from main\. Leave out --from\./,
  );
  assert.equal(world.git(world.store, "branch", "--list", "clean"), "");
});

test("ag new --protect keeps the new branch local", () => {
  createDefault(world);

  const output = ok(world.ag(["new", "work", "--from", "default", "--protect"]));

  assert.match(output, /work is local only/);
  assert.equal(world.originHasBranch("work"), false);
});
