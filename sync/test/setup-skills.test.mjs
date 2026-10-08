import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

test("ag setup names the Active profile's setup skill", () => {
  createDefault(world);

  assert.match(ok(world.ag(["setup"])), /Ask your agent to run the setup-default skill/);
});

test("ag setup prints the prompt when the Active profile has no setup skill of its own", () => {
  createDefault(world);
  ok(world.ag(["new", "child", "--from", "default"]));

  assert.match(fails(world.ag(["setup"])), /Research the `child` profile/);
});

test("ag setup reports that a clean profile needs no setup", () => {
  ok(world.ag(["new", "clean", "--clean"]));

  assert.match(ok(world.ag(["setup"])), /The clean profile needs no setup\./);
});

test("ag skills add installs, commits, pushes, and links the skill", () => {
  createDefault(world);
  world.stub(
    "npx",
    `import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const skill = process.argv[6];
mkdirSync(join(homedir(), ".agents/skills", skill), { recursive: true });
writeFileSync(join(homedir(), ".agents/skills", skill, "SKILL.md"), "skill\\n");
writeFileSync(join(homedir(), ".agents/.skill-lock.json"), "{}\\n");
`,
  );

  ok(world.ag(["skills", "add", "https://example.com/skills", "--skill", "foo"]));

  assert.equal(world.git(world.store, "log", "-1", "--format=%s"), "Add skill foo");
  assert.ok(world.originHas("default", "skills/foo/SKILL.md"));
  assert.equal(world.linkTarget(".cursor/skills/foo"), join(world.store, "skills/foo"));
});
