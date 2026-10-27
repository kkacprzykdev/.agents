import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createDefault, createWorld, fails, ok } from "./world.mjs";

const PROFILE = "profiles/default/artifacts";
const INSTRUCTIONS = `${PROFILE}/instructions-profile-me`;
const GENERATED = "sync/.generated";

let world;
beforeEach(() => {
  world = createWorld();
  mkdirSync(join(world.home, ".codex"));
  createDefault(world);
});
afterEach(() => world.cleanup());

const derived = (rel) => world.read(`${GENERATED}/${rel}`);
const storePath = (rel) => join(world.store, rel);
// Commits the files, then syncs.
const add = (files) => {
  for (const [rel, content] of Object.entries(files)) {
    world.write(rel, content);
  }
  world.commitAll(world.store, "Add artifacts");
  return ok(world.ag(["sync"]));
};

test("Codex gets a Derived AGENTS.md with the text of AGENTS.md and the path of every rule, and no CLAUDE.md", () => {
  add({ [`${INSTRUCTIONS}/AGENTS.md`]: "Write short sentences.\n" });

  assert.equal(world.linkTarget(".codex/AGENTS.md"), storePath(`${GENERATED}/codex/AGENTS.md`));
  assert.equal(world.exists(".codex/CLAUDE.md", world.home), false);
  assert.equal(
    derived("codex/AGENTS.md"),
    [
      `<!-- Derived by ag sync from ${storePath(`${INSTRUCTIONS}/AGENTS.md`)} and the rule files listed below. Edit those files. -->`,
      "",
      "Write short sentences.",
      "",
      "# Rule files",
      "",
      "Before your first reply in a session, read each of these rule files in full and follow it. Its frontmatter, such as `description`, `globs`, `paths`, or `alwaysApply`, says when it applies.",
      "",
      `- \`${storePath("artifacts/rules-store-me/store-rule.mdc")}\``,
      `- \`${storePath(`${PROFILE}/rules-profile-me/default-rule.mdc`)}\``,
      "",
    ].join("\n"),
  );
  assert.equal(world.linkTarget(".claude/CLAUDE.md"), storePath(`${INSTRUCTIONS}/CLAUDE.md`));
  assert.equal(world.linkTarget(".claude/AGENTS.md"), storePath(`${INSTRUCTIONS}/AGENTS.md`));
});

test("Cursor gets AGENTS.md as the Derived rule AGENTS.mdc, which always applies", () => {
  add({ [`${INSTRUCTIONS}/AGENTS.md`]: "Write short sentences.\n" });

  assert.equal(world.linkTarget(".cursor/rules/AGENTS.mdc"), storePath(`${GENERATED}/cursor/rules/AGENTS.mdc`));
  assert.equal(
    derived("cursor/rules/AGENTS.mdc"),
    `---\nalwaysApply: true\n---\n\n<!-- Derived by ag sync from ${storePath(`${INSTRUCTIONS}/AGENTS.md`)}. Edit that file. -->\n\nWrite short sentences.\n`,
  );
  assert.equal(world.exists(".cursor/AGENTS.md", world.home), false);
  assert.equal(world.exists(".cursor/CLAUDE.md", world.home), false);
});

test("a Claude rule links into Claude and reaches Cursor as a Derived .mdc rule, with paths as globs", () => {
  const RULES = `${PROFILE}/rules-profile-me`;
  add({
    [`${RULES}/scoped.md`]: '---\ndescription: TypeScript style\npaths:\n  - "src/**/*.ts"\n  - lib/**\n---\n\nUse strict types.\n',
    [`${RULES}/always.md`]: "Say hello.\n",
  });

  assert.equal(world.linkTarget(".claude/rules/scoped.md"), storePath(`${RULES}/scoped.md`));
  assert.equal(world.linkTarget(".claude/rules/always.md"), storePath(`${RULES}/always.md`));
  assert.equal(world.linkTarget(".cursor/rules/scoped.mdc"), storePath(`${GENERATED}/cursor/rules/scoped.mdc`));
  assert.equal(
    derived("cursor/rules/scoped.mdc"),
    `---\ndescription: TypeScript style\nglobs: src/**/*.ts, lib/**\nalwaysApply: false\n---\n\n<!-- Derived by ag sync from ${storePath(`${RULES}/scoped.md`)}. Edit that file. -->\n\nUse strict types.\n`,
  );
  assert.equal(
    derived("cursor/rules/always.mdc"),
    `---\nalwaysApply: true\n---\n\n<!-- Derived by ag sync from ${storePath(`${RULES}/always.md`)}. Edit that file. -->\n\nSay hello.\n`,
  );
  assert.equal(world.exists(".cursor/rules/scoped.md", world.home), false);
  assert.equal(world.linkTarget(".cursor/rules/default-rule.mdc"), storePath(`${RULES}/default-rule.mdc`));
  assert.equal(world.linkTarget(".claude/rules/default-rule.md"), storePath(`${RULES}/default-rule.mdc`));
  assert.match(derived("codex/AGENTS.md"), new RegExp(`- \`${storePath(`${RULES}/always.md`)}\``));
});

for (const [what, files, message] of [
  [
    "a rule in both formats",
    { "artifacts/rules-store-me/style.mdc": "a\n", [`${PROFILE}/rules-profile-me/style.md`]: "b\n" },
    'Collision: rule "style" comes from both artifacts/rules-store-me/style.mdc and profiles/default/artifacts/rules-profile-me/style.md. Keep one of them: Sync derives the other format.',
  ],
  [
    "a subagent as .md and .toml",
    { [`${PROFILE}/subagents-profile-me/reviewer.md`]: "a\n", [`${PROFILE}/subagents-profile-me/reviewer.toml`]: 'name = "reviewer"\n' },
    'Collision: subagent "reviewer" comes from both profiles/default/artifacts/subagents-profile-me/reviewer.md and profiles/default/artifacts/subagents-profile-me/reviewer.toml. Keep one of them: Sync derives the other format.',
  ],
  [
    "a rule named AGENTS.mdc",
    { [`${PROFILE}/rules-profile-me/AGENTS.mdc`]: "a\n" },
    'Collision: rule "AGENTS" comes from both profiles/default/artifacts/rules-profile-me/AGENTS.mdc and profiles/default/artifacts/instructions-profile-me/AGENTS.md, which Sync derives the Cursor rule AGENTS.mdc from. Rename the rule.',
  ],
]) {
  test(`ag sync stops with a Collision for ${what}, before it changes any agent home`, () => {
    for (const [rel, content] of Object.entries(files)) {
      world.write(rel, content);
    }
    world.commitAll(world.store, "Add artifacts");
    rmSync(join(world.home, ".claude/rules/default-rule.md"));
    rmSync(join(world.home, ".codex/AGENTS.md"));

    const output = fails(world.ag(["sync"]));

    assert.ok(output.includes(message), output);
    assert.equal(world.exists(".claude/rules/default-rule.md", world.home), false);
    assert.equal(world.exists(".codex/AGENTS.md", world.home), false);
  });
}

const COMMANDS = `${PROFILE}/commands-profile-me`;
const commandSkill = (name, source, description, numbering) =>
  [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `<!-- Derived by ag sync from ${source}. Edit that file. -->`,
    "",
    `This skill is the command \`${name}\`. Read \`${source}\` in full and follow it as your instructions. The text the user typed after \`$${name}\` is the command's \`$ARGUMENTS\`.${numbering}`,
    "",
  ].join("\n");

test("a command without positional placeholders links into Cursor and Claude, and reaches Codex as a user-invoked skill", () => {
  add({ [`${COMMANDS}/grill.md`]: "---\ndescription: Grill a plan.\n---\n\nGrill $ARGUMENTS.\n" });

  assert.equal(world.linkTarget(".cursor/commands/grill.md"), storePath(`${COMMANDS}/grill.md`));
  assert.equal(world.linkTarget(".claude/commands/grill.md"), storePath(`${COMMANDS}/grill.md`));
  assert.equal(world.linkTarget(".codex/skills/cmd-grill"), storePath(`${GENERATED}/codex/skills/cmd-grill`));
  assert.equal(derived("codex/skills/cmd-grill/SKILL.md"), commandSkill("grill", storePath(`${COMMANDS}/grill.md`), "Grill a plan.", ""));
  assert.equal(
    derived("codex/skills/cmd-grill/agents/openai.yaml"),
    `# Derived by ag sync from ${storePath(`${COMMANDS}/grill.md`)}. Edit that file.\npolicy:\n  allow_implicit_invocation: false\n`,
  );
});

test("a command with Cursor numbering gets a Derived Claude copy with every number lowered by one", () => {
  const source = storePath(`${COMMANDS}/move.md`);
  add({ [`${COMMANDS}/move.md`]: "---\ndescription: Move a file.\n---\n\nMove $1 to $2. All: $ARGUMENTS.\n" });

  assert.equal(world.linkTarget(".cursor/commands/move.md"), source);
  assert.equal(world.linkTarget(".claude/commands/move.md"), storePath(`${GENERATED}/claude/commands/move.md`));
  assert.equal(
    derived("claude/commands/move.md"),
    `---\ndescription: Move a file.\n---\n\n<!-- Derived by ag sync from ${source}. Edit that file. -->\n\nMove $0 to $1. All: $ARGUMENTS.\n`,
  );
  assert.equal(
    derived("codex/skills/cmd-move/SKILL.md"),
    commandSkill("move", source, "Move a file.", " In that file, `$1` is the first word of it, `$2` the second, and so on."),
  );
});

test("a command with Claude numbering gets a Derived Cursor copy with every number raised by one", () => {
  const source = storePath(`${COMMANDS}/copy.md`);
  add({ [`${COMMANDS}/copy.md`]: "# Copy\n\nCopy $0 to $ARGUMENTS[1], then $1.\n" });

  assert.equal(world.linkTarget(".claude/commands/copy.md"), source);
  assert.equal(world.linkTarget(".cursor/commands/copy.md"), storePath(`${GENERATED}/cursor/commands/copy.md`));
  assert.equal(
    derived("cursor/commands/copy.md"),
    `<!-- Derived by ag sync from ${source}. Edit that file. -->\n\n# Copy\n\nCopy $1 to $2, then $2.\n`,
  );
  assert.equal(
    derived("codex/skills/cmd-copy/SKILL.md"),
    commandSkill(
      "copy",
      source,
      "Copy",
      " In that file, `$0` is the first word of it, `$1` the second, and so on, and `$ARGUMENTS[N]` is the same as `$N`.",
    ),
  );
});

const SUBAGENTS = `${PROFILE}/subagents-profile-me`;

test("a Markdown subagent links into Cursor and Claude, and reaches Codex as a Derived TOML without its model", () => {
  const source = storePath(`${SUBAGENTS}/helper.md`);
  add({ [`${SUBAGENTS}/helper.md`]: "---\nname: helper\ndescription: Helps with \"quotes\".\nmodel: fast\n---\n\nHelp the user.\n" });

  assert.equal(world.linkTarget(".cursor/agents/helper.md"), source);
  assert.equal(world.linkTarget(".claude/agents/helper.md"), source);
  assert.equal(world.linkTarget(".codex/agents/helper.toml"), storePath(`${GENERATED}/codex/agents/helper.toml`));
  assert.equal(
    derived("codex/agents/helper.toml"),
    `# Derived by ag sync from ${source}. Edit that file.\nname = "helper"\ndescription = "Helps with \\"quotes\\"."\ndeveloper_instructions = '''\nHelp the user.\n'''\n`,
  );
});

test("a read-only Markdown subagent stays read-only in Claude and Codex", () => {
  const source = storePath(`${SUBAGENTS}/reviewer.md`);
  add({ [`${SUBAGENTS}/reviewer.md`]: "---\nname: reviewer\ndescription: Reviews code.\nreadonly: true\n---\n\nReview.\n" });

  assert.equal(world.linkTarget(".cursor/agents/reviewer.md"), source);
  assert.equal(world.linkTarget(".claude/agents/reviewer.md"), storePath(`${GENERATED}/claude/agents/reviewer.md`));
  assert.equal(
    derived("claude/agents/reviewer.md"),
    `---\nname: reviewer\ndescription: Reviews code.\nreadonly: true\ndisallowedTools: Write, Edit, NotebookEdit\n---\n\n<!-- Derived by ag sync from ${source}. Edit that file. -->\n\nReview.\n`,
  );
  assert.equal(
    derived("codex/agents/reviewer.toml"),
    `# Derived by ag sync from ${source}. Edit that file.\nname = "reviewer"\ndescription = "Reviews code."\nsandbox_mode = "read-only"\ndeveloper_instructions = '''\nReview.\n'''\n`,
  );
});

test("a read-only Markdown subagent that names its tools links into Claude as it is", () => {
  const source = storePath(`${SUBAGENTS}/reader.md`);
  add({ [`${SUBAGENTS}/reader.md`]: "---\nname: reader\ndescription: Reads.\nreadonly: true\ntools: Read, Grep\n---\n\nRead.\n" });

  assert.equal(world.linkTarget(".claude/agents/reader.md"), source);
});

test("a Codex TOML subagent links into Codex and reaches Cursor and Claude as one Derived Markdown file", () => {
  const source = storePath(`${SUBAGENTS}/auditor.toml`);
  add({
    [`${SUBAGENTS}/auditor.toml`]: [
      "# An auditor.",
      'name = "auditor"',
      "description = 'Audits the code.'",
      'model = "gpt-5"',
      'sandbox_mode = "read-only"',
      'nicknames = ["a", "b"]',
      'developer_instructions = """',
      'Audit "everything".',
      'Report \\\\ findings."""',
      "",
      "[mcp_servers.docs]",
      'url = "https://example.com"',
      "",
    ].join("\n"),
  });

  assert.equal(world.linkTarget(".codex/agents/auditor.toml"), source);
  for (const home of [".cursor", ".claude"]) {
    assert.equal(world.linkTarget(`${home}/agents/auditor.md`), storePath(`${GENERATED}/shared/agents/auditor.md`));
  }
  assert.equal(
    derived("shared/agents/auditor.md"),
    `---\nname: auditor\ndescription: "Audits the code."\nreadonly: true\ndisallowedTools: Write, Edit, NotebookEdit\n---\n\n<!-- Derived by ag sync from ${source}. Edit that file. -->\n\nAudit "everything".\nReport \\ findings.\n`,
  );
});

const SKILLS = `${PROFILE}/skills-profile-me`;
const USER_ONLY = "---\nname: deploy\ndescription: Deploy.\ndisable-model-invocation: true\n---\n\nDeploy.\n";

test("a skill with only the Claude and Cursor key reaches Codex as a Derived folder that adds Codex's policy", () => {
  add({
    [`${SKILLS}/deploy/SKILL.md`]: USER_ONLY,
    [`${SKILLS}/deploy/references/steps.md`]: "steps\n",
    "skills/third-party/SKILL.md": USER_ONLY,
  });

  assert.equal(world.linkTarget(".cursor/skills/deploy"), storePath(`${SKILLS}/deploy`));
  assert.equal(world.linkTarget(".claude/skills/deploy"), storePath(`${SKILLS}/deploy`));
  assert.equal(world.linkTarget(".codex/skills/deploy"), storePath(`${GENERATED}/codex/skills/deploy`));
  assert.equal(world.linkTarget(`.agents/${GENERATED}/codex/skills/deploy/SKILL.md`), storePath(`${SKILLS}/deploy/SKILL.md`));
  assert.equal(world.linkTarget(`.agents/${GENERATED}/codex/skills/deploy/references`), storePath(`${SKILLS}/deploy/references`));
  assert.equal(
    derived("codex/skills/deploy/agents/openai.yaml"),
    `# Derived by ag sync from ${storePath(`${SKILLS}/deploy/SKILL.md`)}. Edit that file.\npolicy:\n  allow_implicit_invocation: false\n`,
  );
  assert.equal(world.linkTarget(".cursor/skills/third-party"), storePath("skills/third-party"));
  assert.equal(world.exists(`${GENERATED}/codex/skills/third-party`), false);
});

test("a Codex policy added to a skill's own agents/openai.yaml keeps the rest of that file", () => {
  add({
    [`${SKILLS}/deploy/SKILL.md`]: USER_ONLY,
    [`${SKILLS}/deploy/agents/openai.yaml`]: "interface:\n  display_name: Deploy\npolicy:\n  allow_implicit_invocation: true\n  other: kept\n",
    [`${SKILLS}/deploy/agents/icon.svg`]: "<svg/>\n",
  });

  assert.equal(
    derived("codex/skills/deploy/agents/openai.yaml"),
    `# Derived by ag sync from ${storePath(`${SKILLS}/deploy/agents/openai.yaml`)} and ${storePath(`${SKILLS}/deploy/SKILL.md`)}. Edit those files.\ninterface:\n  display_name: Deploy\npolicy:\n  allow_implicit_invocation: false\n  other: kept\n`,
  );
  assert.equal(world.linkTarget(`.agents/${GENERATED}/codex/skills/deploy/agents/icon.svg`), storePath(`${SKILLS}/deploy/agents/icon.svg`));
});

test("a skill with only Codex's policy reaches Cursor and Claude as one Derived folder that adds their key", () => {
  add({
    [`${SKILLS}/release/SKILL.md`]: "---\nname: release\ndescription: Release.\n---\n\nRelease.\n",
    [`${SKILLS}/release/agents/openai.yaml`]: "policy:\n  allow_implicit_invocation: false\n",
  });

  assert.equal(world.linkTarget(".codex/skills/release"), storePath(`${SKILLS}/release`));
  for (const home of [".cursor", ".claude"]) {
    assert.equal(world.linkTarget(`${home}/skills/release`), storePath(`${GENERATED}/shared/skills/release`));
  }
  assert.equal(
    derived("shared/skills/release/SKILL.md"),
    `---\nname: release\ndescription: Release.\ndisable-model-invocation: true\n---\n\n<!-- Derived by ag sync from ${storePath(`${SKILLS}/release/SKILL.md`)} and ${storePath(`${SKILLS}/release/agents/openai.yaml`)}. Edit those files. -->\n\nRelease.\n`,
  );
  assert.equal(world.linkTarget(`.agents/${GENERATED}/shared/skills/release/agents`), storePath(`${SKILLS}/release/agents`));
});

test("a skill with both keys links into every coding agent", () => {
  add({
    [`${SKILLS}/both/SKILL.md`]: USER_ONLY,
    [`${SKILLS}/both/agents/openai.yaml`]: "policy:\n  allow_implicit_invocation: false\n",
  });

  for (const home of [".cursor", ".claude", ".codex"]) {
    assert.equal(world.linkTarget(`${home}/skills/both`), storePath(`${SKILLS}/both`));
  }
});

test("ag status lists the Derived files a source edit made stale, and none after ag sync", () => {
  add({ [`${INSTRUCTIONS}/AGENTS.md`]: "Write short sentences.\n" });
  assert.match(ok(world.ag(["status"])), /Derived files: +up to date\n/);

  world.write(`${INSTRUCTIONS}/AGENTS.md`, "Write shorter sentences.\n");
  const output = ok(world.ag(["status"]));

  assert.match(output, /Derived files: +out of date: codex\/AGENTS\.md, cursor\/rules\/AGENTS\.mdc\. Run ag sync\.\n/);
  assert.match(output, /Symlinks: +up to date/);
  ok(world.ag(["sync"]));
  assert.match(ok(world.ag(["status"])), /Derived files: +up to date\n/);
});

test("a removed source removes its Derived file and its link", () => {
  add({ [`${COMMANDS}/move.md`]: "Move $1.\n" });
  assert.ok(world.exists(`${GENERATED}/claude/commands/move.md`));

  world.git(world.store, "rm", "-q", `${COMMANDS}/move.md`);
  world.commitAll(world.store, "Remove the command");
  ok(world.ag(["sync"]));

  assert.equal(world.exists(`${GENERATED}/claude/commands/move.md`), false);
  assert.equal(world.exists(`${GENERATED}/codex/skills/cmd-move`), false);
  assert.throws(() => world.linkTarget(".claude/commands/move.md"), /ENOENT/);
  assert.throws(() => world.linkTarget(".codex/skills/cmd-move"), /ENOENT/);
  assert.match(ok(world.ag(["status"])), /Symlinks: +up to date/);
});

test("ag sync --dry-run writes no Derived file", () => {
  world.write(`${COMMANDS}/move.md`, "Move $1.\n");
  world.commitAll(world.store, "Add a command");

  const output = ok(world.ag(["sync", "--dry-run"]));

  assert.match(output, /Would rebuild \d+ Derived file\(s\)/);
  assert.equal(world.exists(`${GENERATED}/claude/commands/move.md`), false);
});
