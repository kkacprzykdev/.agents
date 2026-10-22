import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

const PROFILE = "profiles/default/artifacts";
const GENERATED = "sync/.generated/codex";

let world;
beforeEach(() => {
  world = createWorld();
  mkdirSync(join(world.home, ".codex"));
  world.write(".gitignore", ".DS_Store\n/sync/.generated/\n");
  world.commitAll(world.store, "Ignore generated files");
  createDefault(world);
  world.write(`${PROFILE}/instructions-profile-me/AGENTS.md`, "agents\n");
  world.write(`${PROFILE}/commands-profile-me/work-state.md`, "---\n---\n\n# Work State\n\nDo it.\n");
  world.write(`${PROFILE}/commands-profile-me/grill.md`, "---\ndescription: Grill a plan.\n---\n\nGrill.\n");
  world.commitAll(world.store, "Add commands");
  ok(world.ag(["sync"]));
});
afterEach(() => world.cleanup());

const node = (script, args) =>
  spawnSync(process.execPath, [join(world.store, "sync/bin", script), ...args], {
    cwd: world.store,
    env: world.env,
    encoding: "utf8",
  });
const parity = (args = []) => node("codex-parity-sync.mjs", args);
const wrapped = (args) => node("ag-codex-parity.mjs", args);
const isLink = (path) => existsSync(join(world.home, path)) && lstatSync(join(world.home, path)).isSymbolicLink();
const generated = () =>
  ["skills/cmd-work-state/SKILL.md", "skills/cmd-grill/SKILL.md", "AGENTS.override.md"].map((rel) =>
    world.read(join(GENERATED, rel)),
  );

test("codex-parity-sync links each command as a user-invoked skill and the rules through AGENTS.override.md, and a rerun changes nothing", () => {
  ok(parity());

  assert.equal(world.linkTarget(".codex/skills/cmd-work-state"), join(world.store, GENERATED, "skills/cmd-work-state"));
  assert.equal(world.linkTarget(".codex/AGENTS.override.md"), join(world.store, GENERATED, "AGENTS.override.md"));
  const [workState, grill, override] = generated();
  assert.match(workState, /^---\nname: work-state\ndescription: "Work State"\n---\n/);
  assert.ok(workState.includes(join(world.store, `${PROFILE}/commands-profile-me/work-state.md`)));
  assert.match(grill, /description: "Grill a plan\."/);
  assert.equal(
    world.read(join(GENERATED, "skills/cmd-grill/agents/openai.yaml")),
    "policy:\n  allow_implicit_invocation: false\n",
  );
  assert.ok(override.includes(join(world.home, ".codex/AGENTS.md")));
  assert.ok(override.includes(join(world.store, "artifacts/rules-store-me/store-rule.mdc")));
  assert.ok(override.includes(join(world.store, `${PROFILE}/rules-profile-me/default-rule.mdc`)));

  ok(parity());
  assert.deepEqual(generated(), [workState, grill, override]);
  assert.ok(isLink(".codex/skills/cmd-work-state"));
  assert.match(ok(world.ag(["status"])), /Symlinks: +up to date/);
});

test("codex-parity-sync removes the skill of a renamed or deleted command", () => {
  ok(parity());
  world.git(world.store, "mv", `${PROFILE}/commands-profile-me/work-state.md`, `${PROFILE}/commands-profile-me/state.md`);
  world.git(world.store, "rm", "-q", `${PROFILE}/commands-profile-me/grill.md`);
  world.commitAll(world.store, "Rename and delete commands");
  ok(world.ag(["sync"]));

  ok(parity());

  assert.ok(isLink(".codex/skills/cmd-state"));
  assert.equal(isLink(".codex/skills/cmd-work-state"), false);
  assert.equal(isLink(".codex/skills/cmd-grill"), false);
  assert.equal(world.exists(join(GENERATED, "skills/cmd-work-state")), false);
  assert.equal(world.exists(join(GENERATED, "skills/cmd-grill")), false);
});

test("codex-parity-sync warns when a command and a skill share a name, and links both", () => {
  world.write(`${PROFILE}/skills-profile-me/grill/SKILL.md`, "grill skill\n");
  world.commitAll(world.store, "Add a grill skill");
  ok(world.ag(["sync"]));

  const output = ok(parity());

  assert.match(output, /warning: the command grill and a skill share that name/);
  assert.ok(isLink(".codex/skills/grill"));
  assert.ok(isLink(".codex/skills/cmd-grill"));
});

test("codex-parity-sync refuses an AGENTS.override.md it did not make, and changes nothing", () => {
  writeFileSync(join(world.home, ".codex/AGENTS.override.md"), "mine\n");

  assert.match(fails(parity()), /AGENTS\.override\.md was not made by this script/);

  assert.equal(readFileSync(join(world.home, ".codex/AGENTS.override.md"), "utf8"), "mine\n");
  assert.equal(isLink(".codex/skills/cmd-grill"), false);
});

test("ag sync drops the command skills, ag-codex-parity puts them back, and --remove deletes everything", () => {
  ok(parity());
  ok(world.ag(["sync"]));
  assert.equal(isLink(".codex/skills/cmd-grill"), false);
  assert.ok(isLink(".codex/AGENTS.override.md"));

  ok(wrapped(["sync", "--dry-run"]));
  assert.equal(isLink(".codex/skills/cmd-grill"), false);
  ok(wrapped(["sync"]));
  assert.ok(isLink(".codex/skills/cmd-grill"));

  ok(parity(["--remove"]));
  assert.equal(isLink(".codex/skills/cmd-grill"), false);
  assert.equal(isLink(".codex/AGENTS.override.md"), false);
  assert.equal(world.exists("sync/.generated"), true);
  assert.equal(world.exists(GENERATED), false);
});

test("ag-codex-parity puts the command skills back after ag new, and ag new leaves the override alone", () => {
  ok(parity());

  ok(wrapped(["new", "child", "--from", "default"]));

  assert.ok(isLink(".codex/skills/cmd-grill"));
  assert.ok(isLink(".codex/skills/cmd-work-state"));
  assert.ok(isLink(".codex/AGENTS.override.md"));
});
