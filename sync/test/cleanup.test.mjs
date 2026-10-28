import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const DEFAULT_RULE = "profiles/default/artifacts/rules-profile-me/default-rule.mdc";
const isLink = (rel) => {
  try {
    return lstatSync(join(world.home, rel)).isSymbolicLink();
  } catch {
    return false;
  }
};
const recordFile = () => join(world.store, ".git/ag-agent-homes");
const recorded = () => (existsSync(recordFile()) ? readFileSync(recordFile(), "utf8").trim().split("\n") : []);
// Core drops a mapping or a target from runtimes.yaml, as a Core change would.
const editRuntimes = (from, to) => {
  const content = world.read("sync/runtimes.yaml");
  assert.ok(content.includes(from), from);
  world.write("sync/runtimes.yaml", content.replace(from, to));
  world.commitPastHook(world.store, "Change the runtime mappings");
};
const CURSOR = "cursor:\n  home: ~/.cursor\n  targets:\n    skills: skills\n    commands: commands\n    rules: rules\n    subagents: agents\n";

test("the first sync remembers the agent homes it synced, but not a listed home that does not exist", () => {
  createDefault(world);

  assert.deepEqual(recorded(), [join(world.home, ".claude"), join(world.home, ".cursor")]);
});

test("ag sync removes the links of a Runtime target that Core removed", () => {
  createDefault(world);
  assert.ok(isLink(".claude/rules/default-rule.md"));
  editRuntimes("    rules: rules\n    subagents: agents\n    instructions: .\n", "    subagents: agents\n    instructions: .\n");

  const output = ok(world.ag(["sync"]));

  assert.ok(output.includes(`removed: old symlink ${join(world.home, ".claude/rules/default-rule.md")}\n`), output);
  assert.equal(isLink(".claude/rules/default-rule.md"), false);
  assert.equal(isLink(".claude/rules/store-rule.md"), false);
  assert.ok(isLink(".claude/CLAUDE.md"));
});

test("ag sync cleans a remembered agent home whose coding agent Core removed", () => {
  createDefault(world);
  editRuntimes(CURSOR, "");

  ok(world.ag(["sync"]));

  assert.equal(isLink(".cursor/rules/default-rule.mdc"), false);
  assert.equal(isLink(".cursor/skills/setup-default"), false);
  assert.ok(recorded().includes(join(world.home, ".cursor")));
});

test("a remembered agent home that disappears stays remembered, and is cleaned when it comes back", () => {
  createDefault(world);
  editRuntimes(CURSOR, "");
  renameSync(join(world.home, ".cursor"), join(world.home, ".cursor-away"));

  ok(world.ag(["sync"]));
  assert.ok(recorded().includes(join(world.home, ".cursor")));

  renameSync(join(world.home, ".cursor-away"), join(world.home, ".cursor"));
  ok(world.ag(["sync"]));
  assert.equal(isLink(".cursor/rules/default-rule.mdc"), false);
});

test("ag sync --dry-run reports the old links it would remove, removes nothing, and writes no record", () => {
  ok(world.ag(["new", "default"]));
  world.write(".git/ag-agent-homes", "");
  editRuntimes(CURSOR, "");
  symlinkSync(join(world.store, "artifacts/rules-store-me/store-rule.mdc"), join(world.home, ".claude/old-rule.md"));

  const output = ok(world.ag(["sync", "--dry-run"]));

  assert.ok(output.includes(`would remove: old symlink ${join(world.home, ".claude/old-rule.md")}\n`), output);
  assert.ok(isLink(".claude/old-rule.md"));
  assert.equal(readFileSync(recordFile(), "utf8"), "");
});

test("the scan goes two levels deep, skips symlinked folders, and removes only links into the store's sources and Derived files", () => {
  createDefault(world);
  const claude = join(world.home, ".claude");
  const rule = join(world.store, DEFAULT_RULE);
  const outside = join(world.base, "outside");
  mkdirSync(join(claude, "plugins/deep"), { recursive: true });
  mkdirSync(join(outside, "nested"), { recursive: true });
  symlinkSync(rule, join(claude, "level-one.md"));
  symlinkSync(rule, join(claude, "plugins/level-two.md"));
  symlinkSync(rule, join(claude, "plugins/deep/level-three.md"));
  symlinkSync(rule, join(outside, "inside-linked-folder.md"));
  symlinkSync(outside, join(claude, "linked-folder"));
  symlinkSync(join(world.store, "README.md"), join(claude, "store-readme.md"));
  symlinkSync(join(world.store, "sync/.generated/codex/AGENTS.override.md"), join(claude, "generated.md"));
  symlinkSync(join(outside, "nested"), join(claude, "unrelated"));

  ok(world.ag(["sync"]));

  assert.equal(isLink(".claude/level-one.md"), false);
  assert.equal(isLink(".claude/plugins/level-two.md"), false);
  assert.ok(isLink(".claude/plugins/deep/level-three.md"));
  assert.ok(isLink(".claude/linked-folder"));
  assert.ok(lstatSync(join(outside, "inside-linked-folder.md")).isSymbolicLink());
  assert.ok(isLink(".claude/store-readme.md"));
  assert.equal(isLink(".claude/generated.md"), false);
  assert.ok(isLink(".claude/unrelated"));
});

test("the scan removes a link to a source folder itself, such as the whole skills folder", () => {
  createDefault(world);
  const claude = join(world.home, ".claude");
  mkdirSync(join(world.store, "skills"), { recursive: true });
  symlinkSync(join(world.store, "skills"), join(claude, "old-skills"));
  symlinkSync(join(world.store, "profiles"), join(claude, "old-profiles"));

  assert.match(ok(world.ag(["status"])), /old-skills/);
  ok(world.ag(["sync"]));

  assert.equal(isLink(".claude/old-skills"), false);
  assert.equal(isLink(".claude/old-profiles"), false);
});

test("after ag use switches to a branch whose Core does not map Codex, Codex keeps no link to the previous profile", () => {
  mkdirSync(join(world.home, ".codex"));
  createDefault(world);
  ok(world.ag(["new", "older"]));
  const runtimes = world.read("sync/runtimes.yaml");
  world.write("sync/runtimes.yaml", runtimes.slice(0, runtimes.indexOf("codex:")));
  world.commitPastHook(world.store, "Map no Codex, as an older Core did");
  ok(world.ag(["push"]));
  ok(world.ag(["use", "default"]));
  assert.equal(world.linkTarget(".codex/AGENTS.md"), join(world.store, "sync/.generated/codex/AGENTS.md"));

  ok(world.ag(["use", "older"]));

  assert.equal(isLink(".codex/AGENTS.md"), false);
  assert.equal(isLink(".codex/CLAUDE.md"), false);
});

test("ag status reports the old links the scan would remove", () => {
  createDefault(world);
  symlinkSync(join(world.store, DEFAULT_RULE), join(world.home, ".claude/old-rule.md"));

  const output = ok(world.ag(["status"]));

  assert.match(output, /Symlinks: +1 out of date — run ag sync\n/);
  assert.ok(output.includes(`${join(world.home, ".claude/old-rule.md")}\n`), output);
  ok(world.ag(["sync"]));
  assert.match(ok(world.ag(["status"])), /Symlinks: +up to date/);
});
