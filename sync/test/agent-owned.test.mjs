import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

// Every agent-owned entry in the world's copy of sync/runtimes.yaml, as a path from the fake home.
function agentOwnedEntries() {
  const entries = [];
  let home = null;
  let inList = false;
  for (const line of world.read("sync/runtimes.yaml").split(/\r?\n/)) {
    const homeLine = line.match(/^  home:\s*~\/(\S+)$/);
    if (homeLine) {
      home = homeLine[1];
    }
    if (/^\S/.test(line) || /^  \S/.test(line)) {
      inList = /^  agent-owned:$/.test(line);
      continue;
    }
    const item = line.match(/^    - (\S+)$/);
    if (inList && item) {
      entries.push(`${home}/${item[1]}`);
    }
  }
  assert.ok(entries.length > 0, "sync/runtimes.yaml lists no agent-owned entry");
  return entries;
}

test("ag sync keeps every agent-owned folder of runtimes.yaml and does not list it", () => {
  createDefault(world);
  const entries = agentOwnedEntries();
  for (const entry of entries) {
    world.write(`${entry}/inner/SKILL.md`, "agent's own\n", world.home);
  }

  const output = ok(world.ag(["sync"]));

  for (const entry of entries) {
    assert.ok(!output.includes(`~/${entry}`), `ag sync listed ~/${entry}`);
    assert.equal(world.read(`${entry}/inner/SKILL.md`, world.home), "agent's own\n");
  }
  assert.doesNotMatch(output, /ag does not manage/);
});

test("ag sync keeps every agent-owned link of runtimes.yaml, even one into the store", () => {
  createDefault(world);
  const entries = agentOwnedEntries();
  const skill = join(world.store, "profiles/default/artifacts/skills-profile-me/setup-default");
  for (const entry of entries) {
    const path = join(world.home, entry);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(skill, path, "junction");
  }

  ok(world.ag(["sync"]));
  ok(world.ag(["status"]));

  for (const entry of entries) {
    assert.ok(lstatSync(join(world.home, entry)).isSymbolicLink(), `${entry} was removed`);
  }
});

test("ag sync stops when an artifact has the name of an agent-owned entry", () => {
  createDefault(world);
  world.write(
    "sync/runtimes.yaml",
    world.read("sync/runtimes.yaml").replace("  home: ~/.cursor\n", "  home: ~/.cursor\n  agent-owned:\n    - skills/agent-skill\n"),
  );
  world.write("profiles/default/artifacts/skills-profile-me/agent-skill/SKILL.md", "mine\n");
  world.git(world.store, "add", "-A");

  assert.match(
    fails(world.ag(["sync"])),
    /"agent-skill" in ~\/\.cursor\/skills belongs to cursor, so ag sync cannot link ".*" there\. Rename the artifact\./,
  );
  assert.equal(world.exists(".cursor/skills/agent-skill", world.home), false);
});

test("ag sync refuses an agent-owned path outside the agent home", () => {
  createDefault(world);
  world.write(
    "sync/runtimes.yaml",
    world.read("sync/runtimes.yaml").replace("  home: ~/.cursor\n", "  home: ~/.cursor\n  agent-owned:\n    - ../elsewhere\n"),
  );

  assert.match(fails(world.ag(["sync"])), /agent-owned path "\.\.\/elsewhere" must be relative to the agent home/);
});
