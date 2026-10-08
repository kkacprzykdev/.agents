import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

const INSTRUCTIONS = "profiles/default/artifacts/instructions-profile-me";

let world;
beforeEach(() => {
  world = createWorld();
  mkdirSync(join(world.home, ".codex"));
});
afterEach(() => world.cleanup());

test("ag sync links AGENTS.md and CLAUDE.md into Claude and Codex, and leaves the rest of each agent home alone", () => {
  createDefault(world);
  world.write(`${INSTRUCTIONS}/AGENTS.md`, "agents\n");
  world.write(`${INSTRUCTIONS}/CLAUDE.md`, "@~/.claude/AGENTS.md\n");
  writeFileSync(join(world.home, ".claude/settings.json"), "{}\n");
  symlinkSync(join(world.home, ".claude/settings.json"), join(world.home, ".claude/my-link.json"));

  const output = ok(world.ag(["sync"]));

  for (const home of [".claude", ".codex"]) {
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      assert.equal(world.linkTarget(`${home}/${file}`), join(world.store, INSTRUCTIONS, file));
    }
  }
  assert.equal(world.exists(".cursor/AGENTS.md", world.home), false);
  assert.equal(world.exists(".cursor/CLAUDE.md", world.home), false);
  assert.equal(world.read(".claude/settings.json", world.home), "{}\n");
  assert.equal(world.linkTarget(".claude/my-link.json"), join(world.home, ".claude/settings.json"));
  assert.doesNotMatch(output, /settings\.json/);
  assert.match(ok(world.ag(["status"])), /Symlinks: +up to date/);
});

test("ag sync removes an instruction file link when the profile no longer has the file", () => {
  createDefault(world);
  world.write(`${INSTRUCTIONS}/AGENTS.md`, "agents\n");
  ok(world.ag(["sync"]));

  unlinkSync(join(world.store, INSTRUCTIONS, "AGENTS.md"));
  ok(world.ag(["sync"]));

  assert.equal(world.exists(".codex/AGENTS.md", world.home), false);
  assert.equal(world.exists(".claude/AGENTS.md", world.home), false);
});

test("ag sync stops when a child and a parent both have AGENTS.md", () => {
  createDefault(world);
  world.write(`${INSTRUCTIONS}/AGENTS.md`, "parent\n");
  world.commitAll(world.store, "Add AGENTS.md");
  ok(world.ag(["new", "child", "--from", "default"]));
  world.write("profiles/child/artifacts/instructions-profile-me/AGENTS.md", "child\n");

  assert.match(fails(world.ag(["sync"])), /Collision: "AGENTS\.md"/);
});

test("ag sync refuses other files in an instructions folder", () => {
  createDefault(world);
  world.write(`${INSTRUCTIONS}/GEMINI.md`, "gemini\n");

  assert.match(
    fails(world.ag(["sync"])),
    /instructions-profile-me\/GEMINI\.md: an instructions folder holds only AGENTS\.md and CLAUDE\.md/,
  );
});

test("a real CLAUDE.md in an agent home is a Blocker when a profile has one, and unmanaged otherwise", () => {
  createDefault(world);
  writeFileSync(join(world.home, ".claude/CLAUDE.md"), "mine\n");

  assert.match(
    ok(world.ag(["sync"])),
    /~\/\.claude\/CLAUDE\.md \(move into profiles\/default\/artifacts\/instructions-profile-me\/ to manage it\)/,
  );

  world.write(`${INSTRUCTIONS}/CLAUDE.md`, "profile\n");
  assert.match(fails(world.ag(["sync"])), /Blocker: .*\n  ~\/\.claude\/CLAUDE\.md \(instructions\)/);
  assert.equal(world.read(".claude/CLAUDE.md", world.home), "mine\n");
});

test("Codex gets store and profile skills, but not third-party skills, which it reads from ~/.agents/skills", () => {
  createDefault(world);
  world.write("skills/third-party/SKILL.md", "third party\n");
  world.write("profiles/default/artifacts/skills-profile-me/mine/SKILL.md", "mine\n");

  ok(world.ag(["sync"]));

  assert.equal(
    world.linkTarget(".codex/skills/mine"),
    join(world.store, "profiles/default/artifacts/skills-profile-me/mine"),
  );
  assert.equal(world.exists(".codex/skills/third-party", world.home), false);
  assert.equal(world.linkTarget(".cursor/skills/third-party"), join(world.store, "skills/third-party"));
  assert.equal(world.exists(".codex/rules", world.home), false);
  assert.equal(world.exists(".codex/prompts", world.home), false);
});
