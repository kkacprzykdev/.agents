#!/usr/bin/env node

import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, delimiter, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = findStoreRoot();
const EDIT_WORKTREE = `${STORE_ROOT}-edit`;
const PROFILES_DIR = join(STORE_ROOT, "profiles");
const ACTIVE_FILE = join(PROFILES_DIR, ".env.active");
const RUNTIMES_FILE = join(STORE_ROOT, "sync", "runtimes.yaml");
// The Derived files, which ag sync rebuilds on every run. Git ignores the folder.
const GENERATED_DIR = join(STORE_ROOT, "sync", ".generated");
const MIGRATIONS_DIR = join("sync", "migrations");
// The folders that Sync links from: profiles, Store and Core-owner artifacts, and third-party skills.
const SOURCE_ROOTS = ["profiles", "artifacts", "skills"].map((folder) => join(STORE_ROOT, folder));
// The agent homes Sync synced on this computer. It lives in the clone's git directory and is never committed.
const AGENT_HOMES_RECORD = "ag-agent-homes";
const MIGRATION_FILE = /^(\d{4})-[a-z0-9][a-z0-9-]*\.mjs$/;
// Sync's own exit code for a pending migration, so ag use can tell it from every other failure.
const MIGRATION_PENDING_EXIT = 3;
const CORE_BRANCH = "main";
const UPSTREAM = "upstream";
const HOOKS_PATH = ".githooks";
const KINDS = ["skills", "commands", "rules", "subagents", "instructions"];
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];
// A Root profile starts with these. Claude resolves a relative import next to the real CLAUDE.md,
// which may sit in another profile than the AGENTS.md in force. ag sync links that one into ~/.claude.
const DEFAULT_INSTRUCTIONS = { "AGENTS.md": "", "CLAUDE.md": "@~/.claude/AGENTS.md\n" };
const PROFILE_NAME = /^[A-Za-z0-9._-]+$/;
const EXCLUDE_HEADER = "# ag: local files listed in profile.yaml";

let dryRun = false;

const HELP = `ag — manage the ~/.agents store

Usage:
  ag help                         Show this help.
  ag init [<url>]                 Turn a fresh clone into your own store: upstream for Core, origin for your pushes.
                                  Writes the Launcher ~/.local/bin/ag, which runs ag with the node on PATH.
  ag new <name> [--from <parent>] [--protect] [--clean]
                                  Create a profile branch from main, or from a parent profile.
                                  --clean creates a clean profile from main, which links no store artifacts.
  ag use <profile>                Check out the profile's branch, then sync.
  ag sync [--dry-run]             Recreate the symlinks in every coding agent for the Active profile's Lineage.
                                  Every command that syncs also writes the Launcher, and says when its folder is
                                  not on PATH.
  ag status                       Show whether Core is read-only, the Active profile, Lineage, Edit worktree,
                                  protection, the Launcher, and symlinks.
  ag setup                        Name the Active profile's setup skill, or print the prompt to create it.
                                  A clean profile needs no setup.
  ag owner <path>                 Print the store path, the branch that owns it, and where to edit it.
                                  A relative path is resolved from the current directory.
  ag edit <branch>                Switch the Edit worktree to a branch.
  ag push                         Push the branches of ~/.agents and the Edit worktree, except local-only ones.
  ag update                       Fast-forward main from upstream if there is one, bring main level with origin,
                                  merge every Lineage branch with its parent, top down, then sync.
  ag skills add <url> [--skill <name>]
                                  Install third-party skills into the Active profile, commit, push, update.
  ag protect <profile>            Block pushes that contain the profile's commits (once per clone).
  ag issue bug|idea --title <title> --body-file <path> [--yes]
                                  File a Core issue on the store that owns Core: the Upstream store, or this
                                  store when it has none. Without --yes, only print a preview.
                                  bug headings: ### What happened, ### What you expected, ### OS (optional).
                                  idea headings: ### Problem, ### Proposed change.

Store root:    ${STORE_ROOT}
Edit worktree: ${EDIT_WORKTREE}
`;

// ag acts on the main checkout, even when it runs from the copy in the Edit worktree.
function findStoreRoot() {
  const fallback = resolve(__dirname, "..", "..");
  const result = spawnSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: fallback, encoding: "utf8" },
  );
  if (result.status !== 0) {
    return fallback;
  }
  return realpathOrSelf(dirname(result.stdout.trim()));
}

function log(level, message) {
  const prefix =
    level === "warn" ? "warning" : level === "info" ? "info" : level;
  console.log(`${prefix}: ${message}`);
}

const WINDOWS = process.platform === "win32";

// Windows paths ignore letter case.
function foldCase(path) {
  return WINDOWS ? path.toLowerCase() : path;
}

// Home paths print as ~/..., with forward slashes on every platform, so messages read the same everywhere.
function display(path) {
  const home = foldCase(realpathOrSelf(homedir()));
  const folded = foldCase(path);
  if (folded === home || folded.startsWith(`${home}${sep}`)) {
    return `~${path.slice(home.length).split(sep).join("/")}`;
  }
  return path;
}

function quoteForCmd(arg) {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

// npm, npx, and gh install as .cmd shims on Windows, which only a shell can run.
function runTool(command, args, options = {}) {
  if (!WINDOWS) {
    return spawnSync(command, args, options);
  }
  return spawnSync([command, ...args].map(quoteForCmd).join(" "), { ...options, shell: true });
}

function toolAvailable(command, args = ["--version"]) {
  const result = runTool(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function git(args, { cwd = STORE_ROOT, allowFail = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  const out = (result.stdout ?? "").trim();
  const err = (result.stderr ?? "").trim();
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} failed: ${err || out}`);
  }
  return { ok: result.status === 0, out, err };
}

// Shows git's own output, for steps where the human must see what git says.
function gitVisible(args, cwd) {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  return result.status === 0;
}

// The native call also expands Windows short names (RUNNER~1), so every path compares in its long form.
function realpathOrSelf(path) {
  return existsSync(path) ? realpathSync.native(path) : resolve(path);
}

function expandPath(path) {
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

function assertProfileName(profile) {
  if (!profile || !PROFILE_NAME.test(profile)) {
    throw new Error(`Invalid profile name: "${profile ?? ""}"`);
  }
}

function currentBranch(cwd = STORE_ROOT) {
  return git(["branch", "--show-current"], { cwd }).out;
}

function readActiveProfile() {
  if (currentBranch() === CORE_BRANCH || !existsSync(ACTIVE_FILE)) {
    throw new Error(
      `No Active profile in ${display(STORE_ROOT)}. Run ag use <profile> or ag new <name>.`,
    );
  }
  const match = readFileSync(ACTIVE_FILE, "utf8").match(
    /^ACTIVE_PROFILE=(.*)$/m,
  );
  const profile = match?.[1].trim();
  if (!profile) {
    throw new Error(`ACTIVE_PROFILE is missing or empty in ${ACTIVE_FILE}`);
  }
  assertProfileName(profile);
  return profile;
}

function parseInlineList(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner.split(",").map((part) => part.trim());
}

// A checkout with Windows line endings must parse the same as one with Unix line endings.
function lines(content) {
  return content.split(/\r?\n/);
}

function stripComment(line) {
  return line.replace(/(^|\s)#.*$/, "").trimEnd();
}

function parseProfileYaml(content, label) {
  const config = { parent: null, clean: false, localFiles: [], migrationLevel: 0 };

  for (const rawLine of lines(content)) {
    const line = stripComment(rawLine);
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([a-z-]+):\s*(.+)$/);
    if (!match) {
      throw new Error(`Unable to parse ${label} line: ${line.trim()}`);
    }
    const [, key, value] = match;

    if (key === "parent") {
      assertParentName(value.trim(), label);
      config.parent = value.trim();
    } else if (key === "clean") {
      if (!["true", "false"].includes(value.trim())) {
        throw new Error(`${label}: clean must be true or false`);
      }
      config.clean = value.trim() === "true";
    } else if (key === "local-files") {
      const list = parseInlineList(value);
      if (!list) {
        throw new Error(`${label}: ${key} must be an inline list like [a, b]`);
      }
      list.forEach((file) => assertLocalFile(file, label));
      config.localFiles = list;
    } else if (key === "migration-level") {
      if (!/^[1-9]\d*$/.test(value.trim())) {
        throw new Error(`${label}: migration-level must be a whole number of 1 or more`);
      }
      config.migrationLevel = Number(value.trim());
    } else if (key === "runtimes") {
      throw new Error(`${label}: delete the runtimes line. Every profile links into every coding agent.`);
    } else {
      throw new Error(`${label}: unknown key "${key}"`);
    }
  }

  if (!config.parent) {
    throw new Error(`${label} has no parent`);
  }
  return config;
}

function assertParentName(parent, label) {
  if (!PROFILE_NAME.test(parent)) {
    throw new Error(`${label}: invalid parent "${parent}"`);
  }
}

function assertLocalFile(file, label) {
  if (!file || isAbsolute(file) || file.split(/[\\/]/).includes("..")) {
    throw new Error(`${label}: invalid local file "${file}"`);
  }
}

// A missing migration-level means level 0, so ag never writes 0.
function serializeProfileYaml({ parent, clean, localFiles, migrationLevel }) {
  const lines = [`parent: ${parent}`];
  if (clean) {
    lines.push("clean: true");
  }
  if (localFiles.length) {
    lines.push(`local-files: [${localFiles.join(", ")}]`);
  }
  if (migrationLevel > 0) {
    lines.push(`migration-level: ${migrationLevel}`);
  }
  return `${lines.join("\n")}\n`;
}

function profileConfigPath(profile) {
  return `profiles/${profile}/profile.yaml`;
}

// With a ref, reads the file from that branch instead of the working tree.
function readProfileConfig(profile, ref) {
  const path = profileConfigPath(profile);
  let content;
  if (ref) {
    const result = git(["show", `${ref}:${path}`], { allowFail: true });
    if (!result.ok) {
      throw new Error(`Branch "${ref}" has no ${path}`);
    }
    content = result.out;
  } else {
    const absolute = join(STORE_ROOT, path);
    if (!existsSync(absolute)) {
      throw new Error(`Profile "${profile}" has no ${path}`);
    }
    content = readFileSync(absolute, "utf8");
  }
  return parseProfileYaml(content, path);
}

// Returns the profiles from the top of the Lineage down to the profile, without main.
function lineage(profile, ref) {
  const chain = [];
  let current = profile;
  while (current !== CORE_BRANCH) {
    assertProfileName(current);
    if (chain.includes(current)) {
      throw new Error(`Lineage loop at "${current}"`);
    }
    chain.unshift(current);
    current = readProfileConfig(current, ref).parent;
  }
  return chain;
}

// The Profile migrations in one checkout's Core, in number order. Numbers start at 1, have no gaps, and never repeat,
// so every store runs the same migrations in the same order.
function migrationsIn(root) {
  const dir = join(root, MIGRATIONS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  const migrations = visibleEntries(dir).map((file) => {
    const match = file.match(MIGRATION_FILE);
    if (!match) {
      throw new Error(`${display(join(dir, file))} is not a Profile migration. Name it like 0001-move-rules.mjs.`);
    }
    return { number: Number(match[1]), name: file.slice(0, -".mjs".length), path: join(dir, file) };
  });
  migrations.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  migrations.forEach((migration, index) => {
    const previous = migrations[index - 1];
    if (previous?.number === migration.number) {
      throw new Error(`${display(dir)}: ${previous.name} and ${migration.name} share a number. Renumber the newer one.`);
    }
    if (migration.number !== index + 1) {
      throw new Error(`${display(dir)}: ${migration.name} should be number ${String(index + 1).padStart(4, "0")}. Numbers start at 0001 and have no gaps.`);
    }
  });
  return migrations;
}

// The newest migration in the Core of one checkout. It is never read from origin.
function coreMigrationLevel(root) {
  return migrationsIn(root).length;
}

// Each Lineage profile's level, read from the Active profile's branch, against the Core of ~/.agents.
function migrationLevels(profile) {
  const core = coreMigrationLevel(STORE_ROOT);
  const levels = lineage(profile).map((name) => ({ name, level: readProfileConfig(name).migrationLevel }));
  return { core, levels };
}

// The new ag must never link a layout it does not know. A profile above its Core comes from a hand edit or an
// interrupted ag new, and its older layout still links, so Sync only warns.
function checkMigrationLevels(profile) {
  const { core, levels } = migrationLevels(profile);
  const list = (filter) => levels.filter(filter).map(({ name, level }) => `  ${name} ${level}/${core}`);
  const below = list(({ level }) => level < core);
  if (below.length) {
    const error = new Error(
      [
        `Migration pending: these profiles are below migration level ${core} of the Core in ${display(STORE_ROOT)}:`,
        ...below,
        "ag sync changed nothing. Run `ag update`, or give this message to your coding agent.",
      ].join("\n"),
    );
    error.exitCode = MIGRATION_PENDING_EXIT;
    throw error;
  }
  const above = list(({ level }) => level > core);
  if (above.length) {
    log(
      "warn",
      [
        `these profiles are above migration level ${core} of the Core in ${display(STORE_ROOT)}:`,
        ...above,
        "ag sync continues. Run ag update to bring this branch's Core level with them.",
      ].join("\n"),
    );
  }
}

function parseRuntimesYaml(content) {
  const runtimes = {};
  let runtime = null;
  let inTargets = false;

  for (const rawLine of lines(content)) {
    const line = stripComment(rawLine);
    if (!line.trim()) {
      continue;
    }

    let match = line.match(/^([A-Za-z0-9_-]+):$/);
    if (match) {
      runtime = { home: null, readsStoreSkills: false, targets: {} };
      runtimes[match[1]] = runtime;
      inTargets = false;
      continue;
    }
    if (!runtime) {
      throw new Error(`Unable to parse runtimes.yaml line: ${line.trim()}`);
    }

    match = line.match(/^  home:\s*(\S+)$/);
    if (match) {
      runtime.home = match[1];
      inTargets = false;
      continue;
    }

    match = line.match(/^  reads-store-skills:\s*(true|false)$/);
    if (match) {
      runtime.readsStoreSkills = match[1] === "true";
      inTargets = false;
      continue;
    }

    if (/^  targets:$/.test(line)) {
      inTargets = true;
      continue;
    }

    match = line.match(/^    ([a-z]+):\s*(\S+)$/);
    if (match && inTargets) {
      const [, kind, value] = match;
      if (!KINDS.includes(kind)) {
        throw new Error(`runtimes.yaml: unknown artifact kind "${kind}"`);
      }
      runtime.targets[kind] = value;
      continue;
    }

    throw new Error(`Unable to parse runtimes.yaml line: ${line.trim()}`);
  }

  for (const [name, config] of Object.entries(runtimes)) {
    if (!config.home) {
      throw new Error(`runtimes.yaml: runtime "${name}" has no home`);
    }
  }
  return runtimes;
}

function loadRuntimes() {
  if (!existsSync(RUNTIMES_FILE)) {
    throw new Error(`Missing ${RUNTIMES_FILE}`);
  }
  return parseRuntimesYaml(readFileSync(RUNTIMES_FILE, "utf8"));
}

// Core-owner artifacts serve only the owner of Core, so a store with an Upstream store does not link them.
function sourcesFor(kind, chain, { clean, ownsCore }) {
  const profileSources = chain.map((profile) => `profiles/${profile}/artifacts/${kind}-profile-me`);
  if (kind === "instructions") {
    return profileSources;
  }
  return [
    ...(kind === "skills" ? [THIRD_PARTY_SKILLS] : []),
    ...(clean ? [] : [`artifacts/${kind}-store-me`]),
    ...(clean || !ownsCore ? [] : [`artifacts/${kind}-core-me`]),
    ...profileSources,
  ];
}

// The instructions target is the agent home itself, which also holds the agent's own files and links.
// There ag sync touches only the instruction file names that coding agent gets.
function manages(target, name) {
  return !target.managed || target.managed.has(name.toLowerCase());
}

const OS_METADATA = new Set([".ds_store", "desktop.ini", "thumbs.db"]);

function visibleEntries(dir) {
  return readdirSync(dir).filter(
    (name) => !name.startsWith(".") && !OS_METADATA.has(name.toLowerCase()),
  );
}

let gitPaths = null;

// Store paths git tracks, and untracked paths it does not ignore. Read once per sync.
function storeGitPaths() {
  if (!gitPaths) {
    const list = (args) => git(["ls-files", "-z", ...args]).out.split("\0").filter(Boolean);
    gitPaths = {
      tracked: list([]),
      untracked: list(["--others", "--exclude-standard"]),
    };
  }
  return gitPaths;
}

function topEntries(paths, sourceDir) {
  const prefix = `${relative(STORE_ROOT, sourceDir).split(sep).join("/")}/`;
  return new Set(
    paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split("/")[0]),
  );
}

// Only an entry git tracks on the current branch is an artifact. A branch switch leaves behind
// a folder that holds ignored files, such as .DS_Store, and that folder must not come back as a link.
function readSource(sourceDir) {
  const { tracked, untracked } = storeGitPaths();
  const trackedNames = topEntries(tracked, sourceDir);
  const untrackedNames = topEntries(untracked, sourceDir);
  const result = { artifacts: [], untracked: [], leftovers: [] };
  for (const name of visibleEntries(sourceDir)) {
    if (trackedNames.has(name)) {
      result.artifacts.push(name);
    } else if (untrackedNames.has(name)) {
      result.untracked.push(name);
    } else if (statSync(join(sourceDir, name)).isDirectory()) {
      result.leftovers.push(name);
    }
  }
  return result;
}

// skills/ is always checked, because a coding agent with reads-store-skills sees a leftover there without a link.
function reportSkippedEntries(planSources) {
  const sources = new Set([THIRD_PARTY_SKILLS, ...planSources]);
  const untracked = [];
  const leftovers = [];
  for (const source of sources) {
    const sourceDir = resolve(STORE_ROOT, source);
    if (!existsSync(sourceDir)) {
      continue;
    }
    const entries = readSource(sourceDir);
    untracked.push(...entries.untracked.map((name) => `${source}/${name}`));
    leftovers.push(...entries.leftovers.map((name) => `${source}/${name}`));
  }
  if (untracked.length) {
    log(
      "warn",
      [
        "ag sync does not link these entries, because git does not track them:",
        ...untracked.map((path) => `  ${path}`),
        "Commit each one you want linked, then run ag sync again.",
      ].join("\n"),
    );
  }
  if (leftovers.length) {
    log(
      "warn",
      [
        "These folders are not on this branch. Git left them behind because they hold only ignored files:",
        ...leftovers.map((path) => `  ${display(join(STORE_ROOT, path))}`),
        "ag sync does not link them. Delete each one.",
      ].join("\n"),
    );
  }
}

// Every artifact of the Lineage, by kind, in source order. Every Collision is found here, before Sync changes anything.
function collectLineage(chain, options, { quiet }) {
  const collected = {};
  for (const kind of KINDS) {
    const sources = sourcesFor(kind, chain, options);
    const artifacts = [];
    // Keyed by lower case, because macOS and Windows treat Foo and foo as one file.
    const byName = new Map();
    let existingSourceCount = 0;
    for (const source of sources) {
      const sourceDir = resolve(STORE_ROOT, source);
      if (!existsSync(sourceDir)) {
        if (!quiet) {
          log("warn", `Skipping missing source directory: ${sourceDir}`);
        }
        continue;
      }
      existingSourceCount += 1;
      for (const name of readSource(sourceDir).artifacts) {
        if (kind === "instructions" && !INSTRUCTION_FILES.includes(name)) {
          throw new Error(`${source}/${name}: an instructions folder holds only ${INSTRUCTION_FILES.join(" and ")}`);
        }
        const key = name.toLowerCase();
        if (byName.has(key)) {
          throw new Error(`Collision: "${name}" comes from both "${byName.get(key).source}" and "${source}"`);
        }
        const sourcePath = resolve(sourceDir, name);
        const artifact = { kind, name, source, sourcePath, isDirectory: statSync(sourcePath).isDirectory() };
        byName.set(key, artifact);
        artifacts.push(artifact);
      }
    }
    checkFormatCollisions(kind, artifacts);
    collected[kind] = { sources, artifacts, existingSourceCount };
  }
  const agents = collected.instructions.artifacts.find((artifact) => artifact.name === "AGENTS.md");
  const rule = collected.rules.artifacts.find((artifact) => logicalName(artifact) === "agents");
  if (agents && rule) {
    throw new Error(
      `Collision: rule "${stem(rule.name)}" comes from both ${rule.source}/${rule.name} and ${agents.source}/${agents.name}, which Sync derives the Cursor rule ${CURSOR_INSTRUCTIONS_RULE} from. Rename the rule.`,
    );
  }
  return collected;
}

// The source formats of one kind, by file extension. Sync derives each one from the other, so one name has one source.
const FORMATS = { rules: [".mdc", ".md"], subagents: [".md", ".toml"] };
const KIND_NAMES = { rules: "rule", subagents: "subagent" };

function stem(name) {
  return name.replace(/\.[^.]+$/, "");
}

function logicalName(artifact) {
  return (artifact.isDirectory ? artifact.name : stem(artifact.name)).toLowerCase();
}

function checkFormatCollisions(kind, artifacts) {
  if (!FORMATS[kind]) {
    return;
  }
  const seen = new Map();
  for (const artifact of artifacts.filter(({ name, isDirectory }) => !isDirectory && FORMATS[kind].some((ext) => name.endsWith(ext)))) {
    const other = seen.get(logicalName(artifact));
    if (other) {
      throw new Error(
        `Collision: ${KIND_NAMES[kind]} "${stem(artifact.name)}" comes from both ${other.source}/${other.name} and ${artifact.source}/${artifact.name}. Keep one of them: Sync derives the other format.`,
      );
    }
    seen.set(logicalName(artifact), artifact);
  }
}

const THIRD_PARTY_SKILLS = "skills";
// Derived files live in sync/.generated/<agent>/. One Derived file for both Cursor and Claude lives in shared/.
const SHARED = "shared";
const CURSOR_INSTRUCTIONS_RULE = "AGENTS.mdc";

// A plain link to the artifact itself.
function linkEntry(artifact) {
  return {
    linkName: artifact.name,
    path: artifact.sourcePath,
    source: artifact.source,
    isDirectory: artifact.isDirectory,
  };
}

// A link to a Derived file or folder, which the plan records under its path in sync/.generated/.
function derivedEntry(plan, linkName, source, rel, nodes, { isDirectory = false } = {}) {
  for (const [path, node] of Object.entries(nodes)) {
    plan.derived.set(path ? `${rel}/${path}` : rel, node);
  }
  return {
    linkName,
    path: join(GENERATED_DIR, ...rel.split("/")),
    source,
    isDirectory,
  };
}

// The marker every Derived Markdown file carries, right after any frontmatter.
function markdownMarker(...sources) {
  return `<!-- ${derivedFrom(sources)} -->`;
}

function derivedFrom(sources) {
  return `Derived by ag sync from ${sources.join(" and ")}. Edit ${sources.length > 1 ? "those files" : "that file"}.`;
}

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

// A Markdown file's frontmatter, as its raw text and its whole block, and the body after it.
function splitFrontmatter(text) {
  const match = text.match(FRONTMATTER);
  return match
    ? { frontmatter: match[1] ?? "", head: match[0], body: text.slice(match[0].length) }
    : { frontmatter: null, head: "", body: text };
}

// One YAML scalar: the text inside its quotes, or the plain text without a trailing comment.
function yamlScalar(text) {
  const value = text.trim();
  const quoted = value.match(/^(["'])(.*?)\1\s*(#.*)?$/);
  return quoted ? quoted[2] : stripComment(value);
}

// The items of a YAML flow list or a comma list. A comma inside quotes, braces, or brackets stays in its item, as in
// the glob src/**/*.{ts,tsx}.
function listItems(text) {
  const items = [];
  let item = "";
  let depth = 0;
  let quote = null;
  for (const char of text) {
    if (quote) {
      quote = char === quote ? null : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "," && depth === 0) {
      items.push(item);
      item = "";
      continue;
    } else {
      depth += "{[".includes(char) ? 1 : "}]".includes(char) ? -1 : 0;
    }
    item += char;
  }
  return [...items, item].map(yamlScalar).filter(Boolean);
}

// One top-level frontmatter key: its line, and its value as a string or, for a YAML list, a list.
function frontmatterKey(frontmatter, key) {
  const all = lines(frontmatter ?? "");
  const index = all.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) {
    return { line: null, value: undefined };
  }
  const inline = all[index].slice(key.length + 1).trim();
  let value;
  if (inline.startsWith("[")) {
    value = listItems(inline.replace(/\]\s*(#.*)?$/, "").slice(1));
  } else if (inline && !inline.startsWith("#")) {
    value = yamlScalar(inline);
  } else {
    value = [];
    for (const line of all.slice(index + 1)) {
      const item = line.match(/^\s+-\s*(.*)$/);
      if (!item) {
        break;
      }
      value.push(yamlScalar(item[1]));
    }
  }
  return { line: all[index], value };
}

// The text with the marker right after its frontmatter, or at the start when it has none.
function withMarker(text, marker) {
  const { head, body } = splitFrontmatter(text);
  return head ? `${head}${head.endsWith("\n") ? "" : "\n"}\n${marker}\n\n${body.replace(/^\r?\n/, "")}` : `${marker}\n\n${text}`;
}

// Every file of the Lineage's rules, by absolute path. A rule folder gives every file in it.
function ruleFiles(collected) {
  const files = (path) =>
    statSync(path).isDirectory()
      ? readdirSync(path).filter((name) => !OS_METADATA.has(name.toLowerCase())).sort().flatMap((name) => files(join(path, name)))
      : [path];
  return collected.rules.artifacts.flatMap((artifact) => files(artifact.sourcePath));
}

function codexInstructions(agents, rules) {
  const from = [agents?.sourcePath, rules.length ? "the rule files listed below" : null].filter(Boolean);
  const out = [`<!-- Derived by ag sync from ${from.join(" and ")}. Edit ${agents && !rules.length ? "that file" : "those files"}. -->`, ""];
  const text = agents ? readFileSync(agents.sourcePath, "utf8").trimEnd() : "";
  if (text) {
    out.push(text, "");
  }
  if (rules.length) {
    out.push(
      "# Rule files",
      "",
      "Before your first reply in a session, read each of these rule files in full and follow it. Its frontmatter, such as `description`, `globs`, `paths`, or `alwaysApply`, says when it applies.",
      "",
      ...rules.map((path) => `- \`${path}\``),
      "",
    );
  }
  return out.join("\n");
}

// Codex gets one Derived AGENTS.md: the text of the Lineage's AGENTS.md, then every rule by path. CLAUDE.md is Claude's.
function adaptInstructions({ agent, artifacts, collected, plan }) {
  if (agent !== "codex") {
    return artifacts.map(linkEntry);
  }
  const agents = artifacts.find((artifact) => artifact.name === "AGENTS.md");
  const rules = ruleFiles(collected);
  if (!agents && !rules.length) {
    return [];
  }
  return [
    derivedEntry(plan, "AGENTS.md", agents?.source ?? "the rules", "codex/AGENTS.md", { "": { file: codexInstructions(agents, rules) } }),
  ];
}

// Cursor ignores .md rules. A Claude rule's paths become globs, and a rule without paths always applies, as in Claude.
function cursorRuleFromClaude(artifact) {
  const { frontmatter, body } = splitFrontmatter(readFileSync(artifact.sourcePath, "utf8"));
  const description = frontmatterKey(frontmatter, "description").line;
  const paths = frontmatterKey(frontmatter, "paths").value;
  const globs = typeof paths === "string" ? listItems(paths) : paths ?? [];
  const head = [
    "---",
    description,
    globs.length ? `globs: ${globs.join(", ")}` : null,
    `alwaysApply: ${!globs.length}`,
    "---",
  ].filter(Boolean);
  return withMarker(`${head.join("\n")}\n${body}`, markdownMarker(artifact.sourcePath));
}

// Claude skips a rule whose file, after links, does not end in .md, so a Cursor rule reaches it as a Derived .md copy.
// Cursor reads no global AGENTS.md, so it gets the text as the Derived rule AGENTS.mdc, which always applies.
function adaptRules({ agent, artifacts, collected, plan }) {
  const entries = artifacts.map((artifact) => {
    if (agent === "claude" && !artifact.isDirectory && artifact.name.endsWith(".mdc")) {
      const name = artifact.name.replace(/\.mdc$/, ".md");
      const text = readFileSync(artifact.sourcePath, "utf8");
      return derivedEntry(plan, name, artifact.source, `claude/rules/${name}`, {
        "": { file: withMarker(text, markdownMarker(artifact.sourcePath)) },
      });
    }
    if (agent !== "cursor" || artifact.isDirectory || !artifact.name.endsWith(".md")) {
      return linkEntry(artifact);
    }
    const name = artifact.name.replace(/\.md$/, ".mdc");
    return derivedEntry(plan, name, artifact.source, `cursor/rules/${name}`, { "": { file: cursorRuleFromClaude(artifact) } });
  });
  const agents = collected.instructions.artifacts.find((artifact) => artifact.name === "AGENTS.md");
  if (agent === "cursor" && agents) {
    const text = `---\nalwaysApply: true\n---\n${readFileSync(agents.sourcePath, "utf8")}`;
    entries.push(
      derivedEntry(plan, CURSOR_INSTRUCTIONS_RULE, agents.source, `cursor/rules/${CURSOR_INSTRUCTIONS_RULE}`, {
        "": { file: withMarker(text, markdownMarker(agents.sourcePath)) },
      }),
    );
  }
  return entries;
}

// Like Claude: the frontmatter description, else the first non-empty body line, without its heading marks.
function describe(text) {
  const { frontmatter, body } = splitFrontmatter(text);
  const description = frontmatterKey(frontmatter, "description").value;
  if (typeof description === "string" && description) {
    return description;
  }
  return lines(body).find((line) => line.trim())?.replace(/^#+\s*/, "").trim() ?? "";
}

const PLACEHOLDER = /\$ARGUMENTS\[(\d+)\]|\$(\d+)/g;

// Cursor numbering makes $1 the first word. Claude numbering makes $0 the first word, and has $ARGUMENTS[N].
function commandNumbering(text) {
  let numbering = null;
  for (const [, index, number] of text.matchAll(PLACEHOLDER)) {
    if (index !== undefined || number === "0") {
      return "claude";
    }
    numbering = "cursor";
  }
  return numbering;
}

// Claude and Cursor replace placeholders before the model reads the command, so only a copy can change the numbering.
function renumber(text, by) {
  return text.replace(PLACEHOLDER, (_, index, number) => `$${Number(index ?? number) + by}`);
}

const NUMBERING_NOTES = {
  cursor: " In that file, `$1` is the first word of it, `$2` the second, and so on.",
  claude: " In that file, `$0` is the first word of it, `$1` the second, and so on, and `$ARGUMENTS[N]` is the same as `$N`.",
};

const CODEX_USER_ONLY = "policy:\n  allow_implicit_invocation: false\n";

function yamlMarker(...sources) {
  return `# ${derivedFrom(sources)}`;
}

// Codex has no commands. Each one is a skill only the user invokes, as $<name>, that points at the command file.
function codexCommandSkill(name, artifact, text) {
  const description = describe(text) || `The ${name} command.`;
  const skill = [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    markdownMarker(artifact.sourcePath),
    "",
    `This skill is the command \`${name}\`. Read \`${artifact.sourcePath}\` in full and follow it as your instructions. The text the user typed after \`$${name}\` is the command's \`$ARGUMENTS\`.${NUMBERING_NOTES[commandNumbering(text)] ?? ""}`,
    "",
  ].join("\n");
  return {
    "SKILL.md": { file: skill },
    "agents/openai.yaml": { file: `${yamlMarker(artifact.sourcePath)}\n${CODEX_USER_ONLY}` },
  };
}

function adaptCommands({ agent, artifacts, plan }) {
  return artifacts.map((artifact) => {
    if (artifact.isDirectory) {
      return linkEntry(artifact);
    }
    const text = readFileSync(artifact.sourcePath, "utf8");
    if (agent === "codex") {
      const name = stem(artifact.name);
      return derivedEntry(plan, `cmd-${name}`, artifact.source, `codex/skills/cmd-${name}`, codexCommandSkill(name, artifact, text), {
        isDirectory: true,
      });
    }
    const by = { cursor: { claude: 1 }, claude: { cursor: -1 } }[agent]?.[commandNumbering(text)];
    if (!by) {
      return linkEntry(artifact);
    }
    return derivedEntry(plan, artifact.name, artifact.source, `${agent}/commands/${artifact.name}`, {
      "": { file: withMarker(renumber(text, by), markdownMarker(artifact.sourcePath)) },
    });
  });
}

// The text with one more line at the end of its frontmatter, or in a new frontmatter.
function withFrontmatterLine(text, line) {
  const { frontmatter, body } = splitFrontmatter(text);
  return `---\n${frontmatter ? `${frontmatter}\n` : ""}${line}\n---\n${frontmatter === null ? "\n" : ""}${body}`;
}

const TOML_ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", e: "\x1b", '"': '"', "\\": "\\" };

function tomlUnescape(text) {
  return text.replace(/\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|[ \t]*\r?\n\s*|(.))/g, (match, u4, u8, char) => {
    if (u4 || u8) {
      return String.fromCodePoint(parseInt(u4 ?? u8, 16));
    }
    return char === undefined ? "" : TOML_ESCAPES[char] ?? match;
  });
}

// The top-level string keys of a TOML file, such as a Codex subagent. Other values and every table are skipped.
function tomlStrings(text) {
  const result = {};
  let at = 0;
  const skipLine = () => {
    const end = text.indexOf("\n", at);
    at = end === -1 ? text.length : end + 1;
  };
  // Reads up to the closing delimiter. A basic string skips each character after a backslash.
  const readUntil = (close, escapes) => {
    let end = at;
    while (end < text.length && !text.startsWith(close, end)) {
      end += escapes && text[end] === "\\" ? 2 : 1;
    }
    const raw = text.slice(at, end);
    at = end + close.length;
    return raw;
  };
  // Any other value: up to the end of the line, past brackets and the strings inside them.
  const skipValue = () => {
    let depth = 0;
    while (at < text.length) {
      const char = text[at];
      if (char === '"' || char === "'") {
        at += 1;
        readUntil(char, char === '"');
      } else if (char === "#" || (char === "\n" && depth === 0)) {
        skipLine();
        return;
      } else {
        depth += "[{".includes(char) ? 1 : "]}".includes(char) ? -1 : 0;
        at += 1;
      }
    }
  };
  while (at < text.length) {
    const rest = text.slice(at);
    const space = rest.match(/^\s+/);
    if (space) {
      at += space[0].length;
      continue;
    }
    if (rest.startsWith("[")) {
      break;
    }
    const key = rest.match(/^([A-Za-z0-9_-]+|"[^"]*"|'[^']*')[ \t]*=[ \t]*/);
    if (!key) {
      skipLine();
      continue;
    }
    at += key[0].length;
    const name = key[1].replace(/^(["'])(.*)\1$/, "$2");
    const quote = ['"""', "'''", '"', "'"].find((delimiter) => text.startsWith(delimiter, at));
    if (!quote) {
      skipValue();
      continue;
    }
    at += quote.length;
    let value = readUntil(quote, quote.startsWith('"'));
    if (quote.length === 3) {
      value = value.replace(/^\r?\n/, "");
    }
    result[name] = quote.startsWith('"') ? tomlUnescape(value) : value;
  }
  return result;
}

// A multi-line literal string keeps the text as it is. JSON's escapes are valid in a TOML basic string.
function tomlText(text) {
  return text.includes("'''") ? JSON.stringify(text) : `'''\n${text}'''`;
}

const READ_ONLY_TOOLS = "disallowedTools: Write, Edit, NotebookEdit";

// Codex 0.164.0 runs a custom agent in the parent's sandbox, whatever its sandbox_mode, so a read-only one is also told.
const CODEX_READ_ONLY = "You are read-only. Change no file: do not create, edit, or delete one, and run no command that does.\n\n";

function codexSubagent(artifact, text) {
  const { frontmatter, body } = splitFrontmatter(text);
  const value = (key) => frontmatterKey(frontmatter, key).value;
  const name = typeof value("name") === "string" && value("name") ? value("name") : stem(artifact.name);
  const readOnly = value("readonly") === "true";
  const instructions = `${readOnly ? CODEX_READ_ONLY : ""}${body.replace(/^(\r?\n)+/, "")}`;
  return [
    yamlMarker(artifact.sourcePath),
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(describe(text) || `The ${name} subagent.`)}`,
    ...(readOnly ? ['sandbox_mode = "read-only"'] : []),
    `developer_instructions = ${tomlText(instructions && !instructions.endsWith("\n") ? `${instructions}\n` : instructions)}`,
    "",
  ].join("\n");
}

// Cursor reads readonly, and Claude reads disallowedTools. Each one ignores the other's key.
function markdownSubagent(artifact, text) {
  const toml = tomlStrings(text);
  const name = toml.name || stem(artifact.name);
  const head = [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(toml.description || `The ${name} subagent.`)}`,
    ...(toml.sandbox_mode === "read-only" ? ["readonly: true", READ_ONLY_TOOLS] : []),
    "---",
  ];
  const instructions = (toml.developer_instructions ?? "").trimEnd();
  return withMarker(`${head.join("\n")}\n${instructions}\n`, markdownMarker(artifact.sourcePath));
}

function adaptSubagents({ agent, artifacts, plan }) {
  return artifacts.map((artifact) => {
    const format = artifact.isDirectory ? null : FORMATS.subagents.find((ext) => artifact.name.endsWith(ext));
    if (!format || !["cursor", "claude", "codex"].includes(agent)) {
      return linkEntry(artifact);
    }
    const text = readFileSync(artifact.sourcePath, "utf8");
    const name = stem(artifact.name);
    if (format === ".toml") {
      return agent === "codex"
        ? linkEntry(artifact)
        : derivedEntry(plan, `${name}.md`, artifact.source, `${SHARED}/agents/${name}.md`, { "": { file: markdownSubagent(artifact, text) } });
    }
    if (agent === "codex") {
      return derivedEntry(plan, `${name}.toml`, artifact.source, `codex/agents/${name}.toml`, { "": { file: codexSubagent(artifact, text) } });
    }
    const { frontmatter } = splitFrontmatter(text);
    const key = (keyName) => frontmatterKey(frontmatter, keyName);
    if (agent === "cursor" || key("readonly").value !== "true" || key("tools").line || key("disallowedTools").line) {
      return linkEntry(artifact);
    }
    return derivedEntry(plan, artifact.name, artifact.source, `claude/agents/${artifact.name}`, {
      "": { file: withMarker(withFrontmatterLine(text, READ_ONLY_TOOLS), markdownMarker(artifact.sourcePath)) },
    });
  });
}

// The lines of the top-level policy block of a Codex agents/openai.yaml: where it starts and ends.
function policyBlock(all) {
  const start = all.findIndex((line) => /^policy:\s*(#.*)?$/.test(line));
  let end = start + 1;
  while (start !== -1 && end < all.length && (/^\s/.test(all[end]) || !all[end].trim())) {
    end += 1;
  }
  return { start, end };
}

// Codex hides a skill from the model only through agents/openai.yaml, not through the SKILL.md key.
function codexUserOnly(yaml) {
  const all = lines(yaml);
  const { start, end } = policyBlock(all);
  return start !== -1 && all.slice(start + 1, end).some((line) => /^\s+allow_implicit_invocation:\s*false\s*(#.*)?$/.test(line));
}

function withCodexPolicy(yaml) {
  const all = yaml ? lines(yaml.replace(/\r?\n$/, "")) : [];
  const { start, end } = policyBlock(all);
  if (start === -1) {
    return `${[...all, ...lines(CODEX_USER_ONLY.trimEnd())].join("\n")}\n`;
  }
  const block = all.slice(start + 1, end).filter((line) => !/^\s+allow_implicit_invocation:/.test(line));
  const indent = block.find((line) => line.trim())?.match(/^\s+/)[0] ?? "  ";
  return `${[...all.slice(0, start), "policy:", `${indent}allow_implicit_invocation: false`, ...block, ...all.slice(end)].join("\n")}\n`;
}

// A Derived folder links every file of the original, except the files it replaces, and the folders that hold them.
function derivedFolder(original, replacements) {
  const nodes = {};
  const visit = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (OS_METADATA.has(name.toLowerCase()) || childRel in replacements) {
        continue;
      }
      if (Object.keys(replacements).some((file) => file.startsWith(`${childRel}/`)) && statSync(path).isDirectory()) {
        visit(path, childRel);
      } else {
        nodes[childRel] = { link: path };
      }
    }
  };
  visit(original, "");
  for (const [file, content] of Object.entries(replacements)) {
    nodes[file] = { file: content };
  }
  return nodes;
}

const CLAUDE_USER_ONLY = "disable-model-invocation: true";

// Codex skips a SKILL.md that is a link. So, like a command skill, the Derived one keeps the frontmatter Codex reads
// and points at the original.
function codexSkillPointer(artifact, skill) {
  const skillFile = join(artifact.sourcePath, "SKILL.md");
  const { head } = splitFrontmatter(skill);
  const body = `Read \`${skillFile}\` in full and follow it as this skill's instructions. Its relative paths start from \`${artifact.sourcePath}\`.\n`;
  return `${withMarker(head, markdownMarker(skillFile))}${body}`;
}

// Each agent gets the "who may invoke it" setting it reads: Cursor and Claude a SKILL.md key, Codex a policy.
// Third-party skills are left alone.
function adaptSkills({ agent, artifacts, plan }) {
  return artifacts.map((artifact) => {
    const skillFile = join(artifact.sourcePath, "SKILL.md");
    const yamlFile = join(artifact.sourcePath, "agents", "openai.yaml");
    if (artifact.source === THIRD_PARTY_SKILLS || !artifact.isDirectory || !existsSync(skillFile)) {
      return linkEntry(artifact);
    }
    const skill = readFileSync(skillFile, "utf8");
    const yaml = existsSync(yamlFile) ? readFileSync(yamlFile, "utf8") : null;
    const claudeKey = frontmatterKey(splitFrontmatter(skill).frontmatter, "disable-model-invocation").value === "true";
    const codexKey = yaml !== null && codexUserOnly(yaml);
    const sources = yaml === null ? [skillFile] : [yamlFile, skillFile];
    if (agent === "codex" && claudeKey && !codexKey) {
      const replacements = {
        "SKILL.md": codexSkillPointer(artifact, skill),
        "agents/openai.yaml": `${yamlMarker(...sources)}\n${withCodexPolicy(yaml)}`,
      };
      return derivedEntry(plan, artifact.name, artifact.source, `codex/skills/${artifact.name}`, derivedFolder(artifact.sourcePath, replacements), {
        isDirectory: true,
      });
    }
    if (["cursor", "claude"].includes(agent) && codexKey && !claudeKey) {
      const { frontmatter } = splitFrontmatter(skill);
      const own = frontmatterKey(frontmatter, "disable-model-invocation").line;
      const withKey = own ? skill.replace(own, CLAUDE_USER_ONLY) : withFrontmatterLine(skill, CLAUDE_USER_ONLY);
      const replacements = { "SKILL.md": withMarker(withKey, markdownMarker(skillFile, yamlFile)) };
      return derivedEntry(plan, artifact.name, artifact.source, `${SHARED}/skills/${artifact.name}`, derivedFolder(artifact.sourcePath, replacements), {
        isDirectory: true,
      });
    }
    return linkEntry(artifact);
  });
}

// The adapters live here, not in runtimes.yaml. Each one picks by the source format of each file and by the coding
// agent, named as in runtimes.yaml. A coding agent the adapters do not know gets plain links.
const ADAPTERS = {
  skills: adaptSkills,
  commands: adaptCommands,
  rules: adaptRules,
  subagents: adaptSubagents,
  instructions: adaptInstructions,
};

// The instruction files each coding agent gets in its agent home. Codex gets only its Derived AGENTS.md.
function instructionNames(agent) {
  return agent === "codex" ? ["AGENTS.md"] : INSTRUCTION_FILES;
}

// Each Runtime target folder ag sync fills, with its links, and every Derived file they need. ag sync and ag status
// build the same plan, so ag status can compare it with what is on disk.
function syncPlan(profile, { quiet = false } = {}) {
  const chain = lineage(profile);
  const { clean } = readProfileConfig(profile);
  const collected = collectLineage(chain, { clean, ownsCore: !hasRemote(UPSTREAM) }, { quiet });
  const plan = { collected, targets: [], derived: new Map(), syncedHomes: [] };

  for (const [agent, runtime] of Object.entries(loadRuntimes())) {
    const home = expandPath(runtime.home);
    if (!existsSync(home)) {
      if (!quiet) {
        log("warn", `Skipping "${agent}" — home not found: ${home}`);
      }
      continue;
    }
    plan.syncedHomes.push(home);
    const byDir = new Map();
    for (const kind of KINDS.filter((name) => runtime.targets[name])) {
      const { sources, artifacts, existingSourceCount } = collected[kind];
      if (existingSourceCount === 0) {
        if (!quiet) {
          log("warn", `Skipping "${agent}" mapping to "${runtime.targets[kind]}" — no source directories exist (${sources.join(", ")})`);
        }
        continue;
      }
      const targetDir = join(home, runtime.targets[kind]);
      if (!byDir.has(targetDir)) {
        const isHome = runtime.targets[kind] === ".";
        const target = {
          targetDir,
          kind,
          managed: isHome ? new Set(instructionNames(agent).map((name) => name.toLowerCase())) : null,
          entries: new Map(),
          keys: new Map(),
        };
        byDir.set(targetDir, target);
        plan.targets.push(target);
      }
      const target = byDir.get(targetDir);
      const own = artifacts.filter((artifact) => !(runtime.readsStoreSkills && artifact.source === THIRD_PARTY_SKILLS));
      const entries = ADAPTERS[kind]({ agent, artifacts: own, collected, plan });
      for (const entry of entries) {
        const key = entry.linkName.toLowerCase();
        if (target.keys.has(key)) {
          throw new Error(`Collision: "${entry.linkName}" comes from both "${target.keys.get(key).source}" and "${entry.source}"`);
        }
        const planned = { ...entry, kind };
        target.keys.set(key, planned);
        target.entries.set(entry.linkName, planned);
      }
    }
  }
  return plan;
}

function removeSymlinks(target) {
  const { targetDir } = target;
  if (!existsSync(targetDir)) {
    return [];
  }

  const removed = [];

  for (const name of readdirSync(targetDir)) {
    const entryPath = join(targetDir, name);
    if (manages(target, name) && lstatSync(entryPath).isSymbolicLink()) {
      removed.push(entryPath);
      if (!dryRun) {
        unlinkSync(entryPath);
      }
    }
  }

  return removed;
}

// Real files and folders in the target folders: Blockers share a name with a store artifact.
// Unmanaged artifacts belong to the agent or the user and are left alone.
function findRealEntries(targets) {
  const blockers = [];
  const unmanaged = [];
  for (const target of targets) {
    if (!existsSync(target.targetDir)) {
      continue;
    }
    for (const name of visibleEntries(target.targetDir)) {
      const path = join(target.targetDir, name);
      if (!manages(target, name) || lstatSync(path).isSymbolicLink()) {
        continue;
      }
      const entry = target.keys.get(name.toLowerCase());
      (entry ? blockers : unmanaged).push({ path, kind: entry?.kind ?? target.kind });
    }
  }
  return { blockers, unmanaged };
}

function artifactFolder(profile, kind) {
  return `profiles/${profile}/artifacts/${kind}-profile-me/`;
}

// The AGENTS.md that ag sync links, where the text of a real instruction file belongs.
function agentsFileInForce(plan, profile) {
  const agents = plan.collected.instructions.artifacts.find((artifact) => artifact.name === "AGENTS.md");
  return agents ? `${agents.source}/AGENTS.md` : `${artifactFolder(profile, "instructions")}AGENTS.md`;
}

// Runs over every runtime before any link changes, so one Blocker anywhere leaves every runtime as it was.
function checkTargets(plan, profile) {
  const { blockers, unmanaged } = findRealEntries(plan.targets);
  if (blockers.length) {
    // An instructions folder accepts only the two instruction file names, so a renamed copy cannot move in.
    const hasInstructions = blockers.some(({ kind }) => kind === "instructions");
    const hasOthers = blockers.some(({ kind }) => kind !== "instructions");
    const advice = [
      hasOthers &&
        `Delete each ${hasInstructions ? "other file or folder" : "one"}, or rename it and move it into ${artifactFolder(profile, "<kind>")} to keep both.`,
      hasInstructions &&
        `Move the text you want to keep from each instruction file into ${agentsFileInForce(plan, profile)}, then delete the file.`,
      "Then run ag sync again.",
    ].filter(Boolean);
    throw new Error(
      [
        "Blocker: these real files or folders have the names of store artifacts, so ag sync changed nothing:",
        ...blockers.map(({ path, kind }) => `  ${display(path)} (${kind})`),
        advice.join(" "),
      ].join("\n"),
    );
  }
  if (unmanaged.length) {
    log(
      "warn",
      [
        "ag does not manage these real files or folders in agent homes:",
        ...unmanaged.map(({ path, kind }) => `  ${display(path)} (move into ${artifactFolder(profile, kind)} to manage it)`),
        "After moving one, commit, then run ag push and ag sync.",
      ].join("\n"),
    );
  }
  for (const { targetDir } of plan.targets) {
    assertCanLink(targetDir);
  }
}

const PROBE_NAME = ".ag-link-probe";

// Windows needs Developer Mode for file symlinks. Directory junctions need no privilege.
// The probe runs before any link is removed, so a refusal leaves the old links in place.
function assertCanLink(targetDir) {
  if (dryRun) {
    return;
  }
  const probe = join(targetDir, PROBE_NAME);
  try {
    rmSync(probe, { force: true });
    symlinkSync(RUNTIMES_FILE, probe, "file");
    unlinkSync(probe);
  } catch (error) {
    const hint = WINDOWS ? " Turn on Developer Mode in Windows Settings, then run ag sync again." : "";
    throw new Error(`Cannot create links in ${targetDir} (${error.code ?? error.message}).${hint}`);
  }
}

function createSymlink(sourcePath, linkPath, isDirectory) {
  if (dryRun) {
    return;
  }

  if (WINDOWS) {
    symlinkSync(sourcePath, linkPath, isDirectory ? "junction" : "file");
    return;
  }

  symlinkSync(sourcePath, linkPath);
}

function ensureTargetDir(targetDir) {
  if (existsSync(targetDir)) {
    return false;
  }

  if (!dryRun) {
    mkdirSync(targetDir, { recursive: true });
  }

  return true;
}

function createLinks({ targetDir, entries }) {
  for (const entry of entries.values()) {
    const linkPath = join(targetDir, entry.linkName);
    log(dryRun ? "would create" : "created", `symlink ${linkPath} -> ${entry.path}`);
    createSymlink(entry.path, linkPath, entry.isDirectory);
  }
  return entries.size;
}

// Every sync builds every Derived file into a staged folder in the clone's git directory, then swaps it in, so a
// crash never leaves half a folder.
function writeDerived(derived) {
  if (dryRun) {
    log("info", `Would rebuild ${derived.size} Derived file(s) in ${display(GENERATED_DIR)}`);
    return;
  }
  const staged = join(gitCommonDir(), "ag-generated-next");
  const old = join(gitCommonDir(), "ag-generated-old");
  for (const path of [staged, old]) {
    rmSync(path, { recursive: true, force: true });
  }
  mkdirSync(staged, { recursive: true });
  for (const [rel, node] of derived) {
    const path = join(staged, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    if ("file" in node) {
      writeFileSync(path, node.file);
    } else {
      createSymlink(node.link, path, statSync(node.link).isDirectory());
    }
  }
  mkdirSync(dirname(GENERATED_DIR), { recursive: true });
  if (existsSync(GENERATED_DIR)) {
    renameSync(GENERATED_DIR, old);
  }
  renameSync(staged, GENERATED_DIR);
  rmSync(old, { recursive: true, force: true });
  log("info", `Rebuilt ${derived.size} Derived file(s) in ${display(GENERATED_DIR)}`);
}

function rememberedAgentHomes() {
  const record = join(gitCommonDir(), AGENT_HOMES_RECORD);
  return existsSync(record) ? lines(readFileSync(record, "utf8")).filter(Boolean) : [];
}

function rememberAgentHomes(homes) {
  if (dryRun) {
    return;
  }
  const all = [...new Set([...rememberedAgentHomes(), ...homes])].sort();
  writeFileSync(join(gitCommonDir(), AGENT_HOMES_RECORD), `${all.join("\n")}\n`);
}

// The listed agent homes and the remembered ones, so a home whose coding agent Core removed is still cleaned.
// A home that does not exist now is skipped, and a remembered one stays remembered.
function agentHomesToScan() {
  const listed = Object.values(loadRuntimes()).map((runtime) => expandPath(runtime.home));
  return [...new Set([...listed, ...rememberedAgentHomes()])].filter((home) => existsSync(home));
}

function pointsIntoStoreSources(linkPath) {
  const target = resolve(dirname(linkPath), readlinkSync(linkPath));
  return [...SOURCE_ROOTS, GENERATED_DIR].some((root) => insideRoot(root, target) !== null);
}

// Symlinks into the store's sources and into sync/.generated/, two levels deep: the entries of each agent home, and
// the entries of each folder directly in it. Symlinked folders are not followed. Real files keep their meaning as
// Blockers and Unmanaged artifacts.
function storeLinksIn(homes) {
  const found = [];
  const visit = (dir, depth) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        if (pointsIntoStoreSources(path)) {
          found.push(path);
        }
      } else if (depth < 2 && stats.isDirectory()) {
        visit(path, depth + 1);
      }
    }
  };
  for (const home of homes) {
    visit(home, 1);
  }
  return found;
}

function gitCommonDir() {
  return git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).out;
}

// Local files must stay ignored on every branch, including branches that do not carry the profile.
// The clone's info/exclude applies to every branch and worktree, and is never committed.
function excludeLocalFiles(profiles) {
  const wanted = profiles.flatMap(({ profile, localFiles }) =>
    localFiles.map((file) => `/profiles/${profile}/${file}`),
  );
  if (!wanted.length || dryRun) {
    return;
  }

  const excludeFile = join(gitCommonDir(), "info", "exclude");
  const existing = existsSync(excludeFile) ? readFileSync(excludeFile, "utf8") : "";
  const present = new Set(existing.split("\n"));
  const missing = wanted.filter((line) => !present.has(line));
  if (!missing.length) {
    return;
  }

  mkdirSync(dirname(excludeFile), { recursive: true });
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  const header = present.has(EXCLUDE_HEADER) ? "" : `${EXCLUDE_HEADER}\n`;
  appendFileSync(excludeFile, `${prefix}${header}${missing.join("\n")}\n`);
}

function excludeLineageLocalFiles(profile) {
  excludeLocalFiles(
    lineage(profile).map((name) => ({
      profile: name,
      localFiles: readProfileConfig(name).localFiles,
    })),
  );
}

function ensureHooksPath() {
  const current = git(["config", "--get", "core.hooksPath"], {
    allowFail: true,
  }).out;
  if (current !== HOOKS_PATH && !dryRun) {
    git(["config", "core.hooksPath", HOOKS_PATH]);
  }
}

function runSync() {
  const profile = readActiveProfile();
  checkMigrationLevels(profile);

  log("info", `Store root: ${STORE_ROOT}`);
  log("info", `Active profile: ${profile}`);
  if (dryRun) {
    log("info", "Dry run — no changes will be made");
  }

  ensureHooksPath();
  excludeLineageLocalFiles(profile);

  gitPaths = null;
  const plan = syncPlan(profile);
  reportSkippedEntries(Object.values(plan.collected).flatMap(({ sources }) => sources));
  for (const { targetDir } of plan.targets) {
    if (ensureTargetDir(targetDir)) {
      log("info", `Created target directory: ${targetDir}`);
    }
  }
  checkTargets(plan, profile);
  writeDerived(plan.derived);

  // 1. Clear every Runtime target. 2. Remove the old links the targets do not cover. 3. Create the links.
  const removed = new Set(plan.targets.flatMap(removeSymlinks));
  for (const path of removed) {
    log(dryRun ? "info" : "removed", `symlink ${path}`);
  }
  for (const path of storeLinksIn(agentHomesToScan())) {
    if (!removed.has(path)) {
      log(dryRun ? "would remove" : "removed", `old symlink ${path}`);
      if (!dryRun) {
        unlinkSync(path);
      }
      removed.add(path);
    }
  }
  const created = plan.targets.reduce((count, target) => count + createLinks(target), 0);
  rememberAgentHomes(plan.syncedHomes);

  log(
    "info",
    `Done — ${plan.syncedHomes.length} runtime(s), ${removed.size} symlink(s) removed, ${created} symlink(s) ${dryRun ? "would be created" : "created"}`,
  );
  ensureLauncher();
}

// Returns runtime paths that differ from what ag sync would create, and the old links its scan would remove.
function findStaleSymlinks(plan) {
  const stale = [];
  const planned = new Map();

  for (const target of plan.targets) {
    const { targetDir, entries } = target;
    const actual = new Map();
    if (existsSync(targetDir)) {
      for (const name of readdirSync(targetDir)) {
        const entryPath = join(targetDir, name);
        if (manages(target, name) && lstatSync(entryPath).isSymbolicLink()) {
          actual.set(name, readlinkSync(entryPath));
        }
      }
    }

    for (const [name, entry] of entries) {
      planned.set(join(targetDir, name), entry.path);
      if (actual.get(name) !== entry.path) {
        stale.push(join(targetDir, name));
      }
    }
    for (const name of actual.keys()) {
      if (!entries.has(name)) {
        stale.push(join(targetDir, name));
      }
    }
  }

  for (const path of storeLinksIn(agentHomesToScan())) {
    if (planned.get(path) !== readlinkSync(path) && !stale.includes(path)) {
      stale.push(path);
    }
  }
  return stale;
}

// The Derived files whose content on disk differs from what ag sync would write, and the ones it would delete,
// by their path in sync/.generated/.
function findStaleDerived(plan) {
  const stale = [];
  const onDisk = new Set();
  const walk = (dir, rel) => {
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      const path = join(dir, name);
      const childRel = rel ? `${rel}/${name}` : name;
      if (lstatSync(path).isDirectory()) {
        walk(path, childRel);
      } else {
        onDisk.add(childRel);
      }
    }
  };
  walk(GENERATED_DIR, "");
  for (const [rel, node] of plan.derived) {
    const path = join(GENERATED_DIR, ...rel.split("/"));
    const stats = lstatSync(path, { throwIfNoEntry: false });
    const current =
      "file" in node
        ? stats?.isFile() && readFileSync(path, "utf8") === node.file
        : stats?.isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === node.link;
    if (!current) {
      stale.push(rel);
    }
  }
  stale.push(...[...onDisk].filter((rel) => !plan.derived.has(rel)));
  return stale.sort();
}

function listWorktrees() {
  const { out } = git(["worktree", "list", "--porcelain"]);
  const worktrees = [];
  let current = null;

  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = {
        path: realpathOrSelf(line.slice("worktree ".length)),
        branch: null,
      };
      worktrees.push(current);
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }

  return worktrees;
}

function branchHolder(branch) {
  return listWorktrees().find((worktree) => worktree.branch === branch)?.path ?? null;
}

function editWorktree() {
  const path = realpathOrSelf(EDIT_WORKTREE);
  return listWorktrees().find((worktree) => worktree.path === path) ?? null;
}

function isDirty(cwd) {
  return git(["status", "--porcelain"], { cwd }).out.length > 0;
}

function assertClean(cwd) {
  if (isDirty(cwd)) {
    throw new Error(
      `${display(cwd)} has uncommitted changes. Commit or discard them first.`,
    );
  }
}

const OPERATIONS = [
  ["MERGE_HEAD", "a merge"],
  ["rebase-merge", "a rebase"],
  ["rebase-apply", "a rebase"],
  ["CHERRY_PICK_HEAD", "a cherry-pick"],
  ["REVERT_HEAD", "a revert"],
];

function operationInProgress(cwd) {
  const gitDir = git(["rev-parse", "--path-format=absolute", "--git-dir"], { cwd }).out;
  return OPERATIONS.find(([file]) => existsSync(join(gitDir, file)))?.[1] ?? null;
}

function checkouts() {
  return editWorktree() ? [STORE_ROOT, realpathOrSelf(EDIT_WORKTREE)] : [STORE_ROOT];
}

function activeProfileOrNull() {
  try {
    return readActiveProfile();
  } catch {
    return null;
  }
}

// Runs before a command changes anything, so a refusal never leaves work half done.
// Local files are excluded first, so a file just added to local-files does not count as a change.
function assertCheckoutsReady() {
  const active = activeProfileOrNull();
  if (active) {
    excludeLineageLocalFiles(active);
  }

  let ready = true;
  for (const cwd of checkouts()) {
    const operation = operationInProgress(cwd);
    if (!operation && !isDirty(cwd)) {
      continue;
    }
    ready = false;
    gitVisible(["status", "--short"], cwd);
    console.error(
      operation
        ? `error: ${display(cwd)} has ${operation} in progress. Finish or abort it first.`
        : `error: ${display(cwd)} has uncommitted changes (listed above). Commit or discard them first.`,
    );
  }
  if (!ready) {
    process.exit(1);
  }
}

function localBranchExists(branch) {
  return git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFail: true,
  }).ok;
}

function hasRemote(name) {
  return git(["remote", "get-url", name], { allowFail: true }).ok;
}

function remoteUrl(name) {
  return git(["remote", "get-url", name]).out;
}

function hasOrigin() {
  return hasRemote("origin");
}

function assertOrigin() {
  if (!hasOrigin()) {
    throw new Error("no origin remote. Add it with: git remote add origin <url>");
  }
}

let remoteBranches = null;

// One ls-remote per command. pushBranch keeps the list current.
function remoteHasBranch(branch) {
  if (!hasOrigin()) {
    return false;
  }
  if (!remoteBranches) {
    const { out } = git(["ls-remote", "--heads", "origin"]);
    remoteBranches = new Set(
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t")[1].replace("refs/heads/", "")),
    );
  }
  return remoteBranches.has(branch);
}

function ensureLocalBranch(branch) {
  if (localBranchExists(branch)) {
    return;
  }
  if (remoteHasBranch(branch)) {
    git(["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`]);
    git(["branch", "--track", branch, `origin/${branch}`]);
    log("created", `local branch "${branch}" from origin/${branch}`);
    return;
  }
  throw new Error(`No branch "${branch}", locally or on origin.`);
}

function treeHas(ref, path) {
  return git(["cat-file", "-e", `${ref}:${path}`], { allowFail: true }).ok;
}

function protectedProfiles() {
  const { out } = git(["config", "--get-all", "ag.noPush"], {
    allowFail: true,
  });
  return out ? out.split("\n").map((line) => line.trim()) : [];
}

// Same test as the pre-push hook: a branch stays local when any commit origin does not have yet
// contains a protected profile's folder.
function protectedFolderIn(branch) {
  const profiles = protectedProfiles();
  if (!profiles.length || !localBranchExists(branch)) {
    return undefined;
  }
  const commits = git(["rev-list", branch, "--not", "--remotes=origin"]).out
    .split("\n")
    .filter(Boolean);
  if (!commits.length) {
    return undefined;
  }

  const queries = commits.flatMap((commit) => profiles.map((profile) => `${commit}:profiles/${profile}`));
  const result = spawnSync("git", ["cat-file", "--batch-check"], {
    cwd: STORE_ROOT,
    input: `${queries.join("\n")}\n`,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git cat-file --batch-check failed: ${result.stderr}`);
  }
  const answers = result.stdout.trim().split("\n");
  const hit = answers.findIndex((line) => !line.endsWith(" missing"));
  return hit === -1 ? undefined : profiles[hit % profiles.length];
}

function isPushable(branch) {
  return !protectedFolderIn(branch);
}

function ensureEditWorktree() {
  if (editWorktree()) {
    return;
  }
  if (existsSync(EDIT_WORKTREE)) {
    throw new Error(
      `${EDIT_WORKTREE} exists but is not a worktree of ${STORE_ROOT}. Move it away and rerun.`,
    );
  }
  if (!localBranchExists(CORE_BRANCH) && remoteHasBranch(CORE_BRANCH)) {
    ensureLocalBranch(CORE_BRANCH);
  }
  if (localBranchExists(CORE_BRANCH) && !branchHolder(CORE_BRANCH)) {
    git(["worktree", "add", EDIT_WORKTREE, CORE_BRANCH]);
  } else {
    git(["worktree", "add", "--detach", EDIT_WORKTREE, "HEAD"]);
  }
  log("created", `Edit worktree ${display(EDIT_WORKTREE)}`);
}

function switchEditWorktree(branch) {
  if (editWorktree()?.branch === branch) {
    return;
  }
  assertClean(EDIT_WORKTREE);
  if (branch) {
    git(["switch", branch], { cwd: EDIT_WORKTREE });
  } else {
    git(["switch", "--detach"], { cwd: EDIT_WORKTREE });
  }
}

function hasConflicts(cwd) {
  return (
    git(["diff", "--name-only", "--diff-filter=U"], { cwd }).out.length > 0 ||
    git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd, allowFail: true }).ok
  );
}

function mergeStep(args, cwd, branch) {
  if (gitVisible(args, cwd)) {
    return;
  }
  if (hasConflicts(cwd)) {
    console.log(`Conflict in ${display(cwd)} on branch ${branch}.`);
    process.exit(1);
  }
  throw new Error(`git ${args.join(" ")} failed in ${display(cwd)}`);
}

function aheadOfOrigin(branch, cwd) {
  if (!remoteHasBranch(branch)) {
    return true;
  }
  git(["fetch", "origin", `${branch}:refs/remotes/origin/${branch}`], { cwd });
  return git(["rev-list", "--count", `origin/${branch}..${branch}`], { cwd }).out !== "0";
}

function pushBranch(branch, cwd) {
  const protectedProfile = protectedFolderIn(branch);
  if (protectedProfile) {
    log("info", `${branch} is local only (it carries the protected profile "${protectedProfile}")`);
    return;
  }
  if (!gitVisible(["push", "-u", "origin", branch], cwd)) {
    throw new Error(`git push origin ${branch} failed in ${display(cwd)}. If origin has newer commits, run ag update.`);
  }
  remoteBranches?.add(branch);
}

function withMigrationLevel(content, level) {
  const line = `migration-level: ${level}`;
  if (/^migration-level:.*$/m.test(content)) {
    return content.replace(/^migration-level:.*$/m, line);
  }
  return `${content}${!content || content.endsWith("\n") ? "" : "\n"}${line}\n`;
}

// Puts the profile folder back to HEAD. Untracked files go, ignored ones, such as local files, stay.
function restoreProfileFolder(folder, cwd) {
  git(["restore", "--source=HEAD", "--staged", "--worktree", "--", folder], { cwd });
  git(["clean", "-fdq", "--", folder], { cwd });
}

function stopMigration(migration, profile, cwd, { instructions, commitMessage }) {
  console.log(
    [
      `Profile migration ${migration.name} stopped on branch ${profile} in ${display(cwd)}. It needs a decision.`,
      "Its changes so far are uncommitted, and the profile keeps its migration level.",
      "",
      String(instructions).trim(),
      "",
      `Then commit in ${display(cwd)} with this message:`,
      `  ${commitMessage}`,
      "then run `ag update`. It finishes the migration.",
      "Follow these steps, or give this message to your coding agent.",
    ].join("\n"),
  );
  process.exit(1);
}

// Runs every migration above the profile's level, in number order, with the modules of the checkout that holds
// the branch. Each one gets one commit that also raises migration-level, so a branch is always at a whole level.
// A migration returns done, or stop with instructions. It throws only on a bug.
async function runMigrations(profile, cwd) {
  const folder = `profiles/${profile}`;
  const configFile = join(cwd, profileConfigPath(profile));
  const { migrationLevel } = parseProfileYaml(readFileSync(configFile, "utf8"), profileConfigPath(profile));

  for (const migration of migrationsIn(cwd).slice(migrationLevel)) {
    log("info", `Running Profile migration ${migration.name} on ${profile} in ${display(cwd)}`);
    let result;
    try {
      result = await (await import(pathToFileURL(migration.path).href)).migrate(join(cwd, folder));
    } catch (error) {
      restoreProfileFolder(folder, cwd);
      throw new Error(
        [
          `Profile migration ${migration.name} failed on branch ${profile} in ${display(cwd)}:`,
          String(error?.stack ?? error),
          `${folder} is back at its last commit, and levels committed before it stay. Run ag update again once the migration is fixed.`,
        ].join("\n"),
      );
    }
    if (result?.status === "stop") {
      stopMigration(migration, profile, cwd, result);
    }
    if (result?.status !== "done") {
      restoreProfileFolder(folder, cwd);
      throw new Error(`Profile migration ${migration.name} returned neither done nor stop on branch ${profile} in ${display(cwd)}.`);
    }
    writeFileSync(configFile, withMigrationLevel(readFileSync(configFile, "utf8"), migration.number));
    const message = `Run Profile migration ${migration.name} on \`${profile}\``;
    git(["add", "-A", "--", folder], { cwd });
    git(["commit", "-q", "-m", message], { cwd });
    log("committed", message);
  }
}

async function updateBranch(branch, parent, cwd) {
  log("info", `Updating ${branch} in ${display(cwd)}`);
  const pushable = isPushable(branch);

  if (pushable && remoteHasBranch(branch)) {
    mergeStep(["pull", "origin", branch, "--no-rebase", "--no-edit"], cwd, branch);
  }
  if (parent === CORE_BRANCH || isPushable(parent)) {
    mergeStep(["pull", "origin", parent, "--no-rebase", "--no-edit"], cwd, branch);
  } else {
    mergeStep(["merge", parent, "--no-edit"], cwd, branch);
  }
  await runMigrations(branch, cwd);
  if (pushable && hasOrigin() && aheadOfOrigin(branch, cwd)) {
    pushBranch(branch, cwd);
  }
}

function activeBranch() {
  const profile = readActiveProfile();
  const branch = currentBranch();
  if (branch !== profile) {
    throw new Error(
      `${display(STORE_ROOT)} is on "${branch}", but ACTIVE_PROFILE is "${profile}". Run ag use ${profile}.`,
    );
  }
  return profile;
}

// The Edit worktree rests on main, so every run ends in the same state, even a rerun after a conflict.
function parkEditWorktree() {
  if (!editWorktree() || !localBranchExists(CORE_BRANCH)) {
    return;
  }
  const holder = branchHolder(CORE_BRANCH);
  if (!holder || holder === realpathOrSelf(EDIT_WORKTREE)) {
    switchEditWorktree(CORE_BRANCH);
  }
}

const UPSTREAM_CORE = `refs/remotes/${UPSTREAM}/${CORE_BRANCH}`;

// Core is read-only in a store with an Upstream store. A commit of its own on main, local or on origin,
// would conflict with later Core changes, so ag update and ag push refuse it.
function ownCoreCommits() {
  git(["fetch", UPSTREAM, `+refs/heads/${CORE_BRANCH}:${UPSTREAM_CORE}`]);
  const heads = [CORE_BRANCH];
  if (remoteHasBranch(CORE_BRANCH)) {
    git(["fetch", "origin", `${CORE_BRANCH}:refs/remotes/origin/${CORE_BRANCH}`]);
    heads.push(`origin/${CORE_BRANCH}`);
  }
  return git(["log", "--format=%h %s", ...heads, "--not", UPSTREAM_CORE]).out;
}

function refuseOwnCoreCommits(own, cwd, command) {
  const checkout = display(cwd);
  console.log(`${CORE_BRANCH} has commits that the Upstream store does not have:`);
  for (const line of own.split("\n")) {
    console.log(`  ${line}`);
  }
  console.log(`Core is read-only in a store with an Upstream store, so ${CORE_BRANCH} only takes commits from it.`);
  console.log(`Copy any change you want to keep into a profile. Then reset ${CORE_BRANCH} to the Upstream store:`);
  console.log(`  git -C ${checkout} reset --hard ${UPSTREAM}/${CORE_BRANCH}`);
  console.log(`  git -C ${checkout} push --force-with-lease origin ${CORE_BRANCH}`);
  console.log("These commands drop the commits above. An agent must ask the user before running them.");
  throw new Error(`${CORE_BRANCH} has diverged from ${UPSTREAM}/${CORE_BRANCH} (see above). Reset it, then run ag ${command} again.`);
}

// The Upstream store's Core lands on main first. Root profiles then take it from origin like any main commit.
function fastForwardUpstreamCore() {
  if (!hasRemote(UPSTREAM)) {
    return;
  }
  ensureLocalBranch(CORE_BRANCH);
  const own = ownCoreCommits();
  if (own) {
    ensureEditWorktree();
    switchEditWorktree(CORE_BRANCH);
    refuseOwnCoreCommits(own, EDIT_WORKTREE, "update");
  }

  if (git(["rev-list", "--count", `${CORE_BRANCH}..${UPSTREAM_CORE}`]).out === "0") {
    return;
  }
  ensureEditWorktree();
  switchEditWorktree(CORE_BRANCH);
  log("info", `Fast-forwarding ${CORE_BRANCH} to ${UPSTREAM}/${CORE_BRANCH} in ${display(EDIT_WORKTREE)}`);
  mergeStep(["merge", "--ff-only", UPSTREAM_CORE], EDIT_WORKTREE, CORE_BRANCH);
}

// Profiles merge main from origin, so a main commit that was never pushed would not reach them.
// The local main also takes origin's commits, because the Edit worktree rests on it after the update.
function updateCore() {
  if (!localBranchExists(CORE_BRANCH)) {
    return;
  }
  const ahead = aheadOfOrigin(CORE_BRANCH, STORE_ROOT);
  const behind =
    remoteHasBranch(CORE_BRANCH) && git(["rev-list", "--count", `${CORE_BRANCH}..origin/${CORE_BRANCH}`]).out !== "0";
  if (!ahead && !behind) {
    return;
  }
  ensureEditWorktree();
  switchEditWorktree(CORE_BRANCH);
  log("info", `Updating ${CORE_BRANCH} in ${display(EDIT_WORKTREE)}`);
  if (behind) {
    mergeStep(["pull", "origin", CORE_BRANCH, "--no-rebase", "--no-edit"], EDIT_WORKTREE, CORE_BRANCH);
  }
  if (ahead) {
    pushBranch(CORE_BRANCH, EDIT_WORKTREE);
  }
}

// The running process keeps the ag it started with. Once main holds a different ag, that old
// copy can reject a config the new ag understands, such as a new coding agent. The new file
// finishes the update instead.
function continueWithMergedAg() {
  if (process.env.AG_UPDATE_REEXEC === "1") {
    return false;
  }
  const current = fileURLToPath(import.meta.url);
  const next = join(EDIT_WORKTREE, "sync", "bin", "ag.mjs");
  if (!existsSync(next) || readFileSync(current).equals(readFileSync(next))) {
    return false;
  }
  log("info", "Continuing this update with the ag that was just merged.");
  const result = spawnSync(process.execPath, [next, "update"], {
    stdio: "inherit",
    env: { ...process.env, AG_UPDATE_REEXEC: "1" },
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
  return true;
}

async function runUpdate() {
  assertOrigin();
  const active = activeBranch();
  assertCheckoutsReady();

  const chain = lineage(active);
  fastForwardUpstreamCore();
  updateCore();
  if (continueWithMergedAg()) {
    return;
  }

  for (let index = 0; index < chain.length; index += 1) {
    const branch = chain[index];
    const parent = index === 0 ? CORE_BRANCH : chain[index - 1];

    if (branch === active) {
      await updateBranch(branch, parent, STORE_ROOT);
    } else {
      ensureLocalBranch(branch);
      ensureEditWorktree();
      switchEditWorktree(branch);
      await updateBranch(branch, parent, EDIT_WORKTREE);
    }
  }

  parkEditWorktree();
  runSync();
}

// Each Profile branch is synced by its own ag, which knows that branch's layout. The running process keeps the
// code it started with, so a different ag on the switched branch syncs in a new process. Every ag has ag sync.
// Returns Sync's exit code.
function syncWithBranchAg(ownAg) {
  const branchAg = join(STORE_ROOT, "sync", "bin", "ag.mjs");
  if (existsSync(branchAg) && !readFileSync(branchAg).equals(ownAg)) {
    log("info", "The ag on this branch differs from the running one, so ag use runs its ag sync.");
    return spawnSync(process.execPath, [branchAg, "sync"], { stdio: "inherit" }).status ?? 1;
  }
  try {
    runSync();
    return 0;
  } catch (error) {
    console.error(`error: ${error.message}`);
    return error.exitCode ?? 1;
  }
}

function runUse(profile) {
  assertProfileName(profile);
  if (profile === CORE_BRANCH) {
    throw new Error(
      `${CORE_BRANCH} has no profile. Core edits go through the Edit worktree: ag edit ${CORE_BRANCH}.`,
    );
  }
  assertOrigin();
  assertCheckoutsReady();
  ensureLocalBranch(profile);

  // When ~/.agents holds main, the Edit worktree cannot take it, so it lets go of its branch instead.
  if (editWorktree()?.branch === profile) {
    const coreFree = localBranchExists(CORE_BRANCH) && !branchHolder(CORE_BRANCH);
    switchEditWorktree(coreFree ? CORE_BRANCH : null);
  }
  const holder = branchHolder(profile);
  if (holder && holder !== STORE_ROOT) {
    throw new Error(`Branch "${profile}" is checked out at ${display(holder)}. Free it first.`);
  }

  // Read before the switch, which replaces the file on disk.
  const ownAg = readFileSync(fileURLToPath(import.meta.url));
  const previous = currentBranch();
  const previousCommit = git(["rev-parse", "HEAD"]).out;
  if (previous !== profile) {
    git(["switch", profile]);
    log("info", `Switched ${STORE_ROOT} to "${profile}"`);
  }

  const active = readActiveProfile();
  if (active !== profile) {
    log("warn", `Branch "${profile}" has ACTIVE_PROFILE=${active} in ${ACTIVE_FILE}`);
  }

  // A pending migration keeps the switch, so ag update can finish it on the Active profile. Any other failure
  // switches back, so ~/.agents and the agent homes never point at different profiles. Sync checks before it
  // changes anything, so the agent homes are unchanged.
  const status = syncWithBranchAg(ownAg);
  if (status !== 0 && status !== MIGRATION_PENDING_EXIT) {
    if (previous !== profile) {
      git(previous ? ["switch", previous] : ["switch", "--detach", previousCommit]);
      log("info", `Switched ${STORE_ROOT} back to "${previous || previousCommit}", because ag sync failed. The agent homes are unchanged.`);
    }
    process.exit(status);
  }
  ensureEditWorktree();
  if (status !== 0) {
    process.exit(status);
  }
}

function setupSkillPath(profile) {
  return `profiles/${profile}/artifacts/skills-profile-me/setup-${profile}/SKILL.md`;
}

function setupPrompt(profile) {
  return `Research the \`${profile}\` profile in \`${display(STORE_ROOT)}/profiles/${profile}/\`: its artifacts, references, and local files. Then create the \`setup-${profile}\` skill at \`${setupSkillPath(profile)}\`. The skill configures a profile created from \`${profile}\`, and \`${profile}\` itself on a new machine. \`ag new\` may have already copied the local files, such as \`.env\`, into the new profile. When a file the skill would create already exists, the skill shows its current values and asks the human whether they are correct. Check that \`local-files\` in \`profiles/${profile}/profile.yaml\` lists every local file the profile uses, and add any that are missing. The skill repeats that check every time it runs. At the end of every run, the skill runs \`ag sync\`, then \`ag status\`, and finishes only when \`ag status\` prints \`Symlinks:        up to date\`. It then ends with exactly one of these messages, word for word. When the run created or changed a file: \`Setup of the <name> profile is complete, and its artifacts are synced to every coding agent. You can use it now.\` When nothing needed configuring: \`The <name> profile needs no extra setup, and its artifacts are synced to every coding agent. You can use it now.\` \`<name>\` is the profile being set up.`;
}

function runSetup() {
  const profile = readActiveProfile();
  if (readProfileConfig(profile).clean) {
    console.log(`The ${profile} profile needs no setup.`);
    return;
  }
  if (existsSync(join(STORE_ROOT, setupSkillPath(profile)))) {
    console.log(`Ask your agent to run the setup-${profile} skill to configure the ${profile} profile.`);
    return;
  }
  console.log(setupPrompt(profile));
  throw new Error(`Profile "${profile}" has no setup-${profile} skill. Give the prompt above to an agent.`);
}

function parseNewArgs(args) {
  const options = { name: null, from: null, protect: false, clean: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--from") {
      options.from = args[index + 1];
      index += 1;
    } else if (arg === "--protect") {
      options.protect = true;
    } else if (arg === "--clean") {
      options.clean = true;
    } else if (!options.name && !arg.startsWith("--")) {
      options.name = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

// The instruction files a new profile's Lineage links, and the AGENTS.md among them.
function newLineageInstructions(name, parent, clean) {
  const ownAgents = `${artifactFolder(name, "instructions")}AGENTS.md`;
  if (clean) {
    return { files: [], agentsPath: ownAgents };
  }
  if (parent === CORE_BRANCH) {
    return { files: Object.keys(DEFAULT_INSTRUCTIONS), agentsPath: ownAgents };
  }
  const paths = lineage(parent, parent).flatMap((profile) =>
    INSTRUCTION_FILES.map((file) => `${artifactFolder(profile, "instructions")}${file}`),
  ).filter((path) => treeHas(parent, path));
  return {
    files: INSTRUCTION_FILES.filter((file) => paths.some((path) => path.endsWith(`/${file}`))),
    agentsPath: paths.find((path) => path.endsWith("/AGENTS.md")) ?? ownAgents,
  };
}

// Real files with these names in the agent homes, which ag sync would report as Blockers.
function realInstructionFiles(files) {
  const found = [];
  for (const [agent, runtime] of Object.entries(loadRuntimes())) {
    const target = runtime.targets.instructions;
    const dir = target && join(expandPath(runtime.home), target);
    if (!dir || !existsSync(dir)) {
      continue;
    }
    const names = new Set(files.filter((file) => instructionNames(agent).includes(file)).map((file) => file.toLowerCase()));
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (names.has(entry.toLowerCase()) && !lstatSync(path).isSymbolicLink()) {
        found.push(path);
      }
    }
  }
  return found;
}

async function runNew(args) {
  const { name, from, protect, clean } = parseNewArgs(args);
  assertProfileName(name);
  if (name === CORE_BRANCH) {
    throw new Error(`"${CORE_BRANCH}" is the Core branch, not a profile name.`);
  }
  if (clean && from !== null) {
    throw new Error(`A clean profile is created from ${CORE_BRANCH}. Leave out --from.`);
  }
  if (from !== null) {
    assertProfileName(from);
    if (from === CORE_BRANCH) {
      throw new Error(`Leave out --from to create a profile from ${CORE_BRANCH}.`);
    }
  }
  assertOrigin();
  assertCheckoutsReady();
  if (localBranchExists(name) || remoteHasBranch(name)) {
    throw new Error(`Branch "${name}" already exists.`);
  }

  const parent = from ?? CORE_BRANCH;
  ensureLocalBranch(parent);

  let parentConfig = null;
  if (from) {
    if (!treeHas(parent, profileConfigPath(parent))) {
      throw new Error(`Branch "${parent}" has no ${profileConfigPath(parent)}, so it is not a profile.`);
    }
    if (!treeHas(parent, setupSkillPath(parent))) {
      console.log(setupPrompt(parent));
      throw new Error(
        `Profile "${parent}" has no setup-${parent} skill. Give the prompt above to an agent, then run ag new again.`,
      );
    }
    parentConfig = readProfileConfig(parent, parent);
  }

  // ag new commits and pushes before its first sync, so a Blocker found there would leave the profile half set up.
  const instructions = newLineageInstructions(name, parent, clean);
  const blocking = realInstructionFiles(instructions.files);
  if (blocking.length) {
    throw new Error(
      [
        "These real global instruction files would block ag sync, so ag new changed nothing:",
        ...blocking.map((path) => `  ${display(path)}`),
        `Rename each one, for example to ${basename(blocking[0])}.old. Then run ag new again, and move their text into ${instructions.agentsPath}.`,
      ].join("\n"),
    );
  }

  const profileDir = join(PROFILES_DIR, name);
  if (existsSync(profileDir) && readdirSync(profileDir).length) {
    throw new Error(`${display(profileDir)} already exists on disk. Move it away first.`);
  }

  // Today's skeleton is at the running ag's level. Its checkout holds the running ag, and the switch below
  // replaces the files on disk, so the level is read first. The final ag update fixes any difference.
  const migrationLevel = coreMigrationLevel(resolve(__dirname, "..", ".."));
  git(["switch", "-c", name, parent]);

  const localFiles = parentConfig?.localFiles ?? [];
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "profile.yaml"),
    serializeProfileYaml({ parent, clean, localFiles, migrationLevel }),
  );
  for (const kind of KINDS) {
    const kindDir = join(profileDir, "artifacts", `${kind}-profile-me`);
    mkdirSync(kindDir, { recursive: true });
    const files = kind === "instructions" && !clean && !from ? DEFAULT_INSTRUCTIONS : { ".gitkeep": "" };
    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(kindDir, file), content);
    }
  }

  excludeLocalFiles([{ profile: name, localFiles }]);
  for (const file of localFiles) {
    const source = join(PROFILES_DIR, parent, file);
    if (existsSync(source)) {
      cpSync(source, join(profileDir, file), { recursive: true });
      log("copied", `${display(source)} -> ${display(join(profileDir, file))}`);
    }
  }

  writeFileSync(ACTIVE_FILE, `ACTIVE_PROFILE=${name}\n`);
  git(["add", `profiles/${name}`, "profiles/.env.active"]);
  git(["commit", "-q", "-m", `Create profile \`${name}\``]);
  log("created", `profile "${name}" on branch "${name}" from "${parent}"`);

  if (protect) {
    runProtect(name);
  }
  const protectedAncestor = lineage(name).find(
    (profile) => profile !== name && protectedProfiles().includes(profile),
  );
  if (protectedAncestor) {
    log("info", `${name} is protected too, because its ancestor "${protectedAncestor}" is protected.`);
  }

  pushBranch(name, STORE_ROOT);
  // No Sync before the final ag update: the parent's Core may be older than this profile's level. That update
  // merges main down the Lineage, runs any pending migrations, then syncs.
  ensureEditWorktree();
  await runUpdate();

  console.log(
    from
      ? `Created profile ${name}. Ask your agent to run the setup-${parent} skill to configure it.`
      : `Created profile ${name}.`,
  );
}

// Pushes both checkouts, so it does not matter which directory ag push runs from.
function runPush() {
  assertOrigin();
  const coreCheckout = checkouts().find((cwd) => currentBranch(cwd) === CORE_BRANCH);
  if (coreCheckout && hasRemote(UPSTREAM)) {
    const own = ownCoreCommits();
    if (own) {
      refuseOwnCoreCommits(own, coreCheckout, "push");
    }
  }
  for (const cwd of checkouts()) {
    const branch = currentBranch(cwd);
    if (!branch) {
      log("info", `${display(cwd)} is not on a branch. Nothing to push from it.`);
    } else if (!aheadOfOrigin(branch, cwd)) {
      log("info", `${branch} is up to date on origin`);
    } else {
      pushBranch(branch, cwd);
    }
  }
}

function createRepoWithGh() {
  const urlHint = "Or pass the URL of your own empty repository: ag init <url>";
  if (!toolAvailable("gh")) {
    throw new Error(`The GitHub CLI (gh) is not installed, so ag init cannot create your repository. ${urlHint}`);
  }
  if (!toolAvailable("gh", ["auth", "status"])) {
    throw new Error(`gh is not signed in. Run gh auth login, then ag init again. ${urlHint}`);
  }
  const name = basename(STORE_ROOT);
  const result = runTool("gh", ["repo", "create", name, "--private"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`gh repo create ${name} --private failed: ${(result.stderr ?? "").trim()}. ${urlHint}`);
  }
  const url = result.stdout.trim().split("\n").pop().trim();
  log("created", `private repository ${url}`);
  return url.endsWith(".git") ? url : `${url}.git`;
}

const LAUNCHER_DIR = join(homedir(), ".local", "bin");
const SYNC_TOOL = "ag.mjs";

function storeScript(target) {
  return join(STORE_ROOT, "sync", "bin", target);
}

// Git Bash reads a Windows path with forward slashes.
function shellLauncher() {
  const path = storeScript(SYNC_TOOL).split(sep).join("/").replace(/["$`\\]/g, "\\$&");
  return `#!/bin/sh\n# ag launcher\nexec node "${path}" "$@"\n`;
}

function cmdLauncher() {
  return `@rem ag launcher\r\n@node "${storeScript(SYNC_TOOL).replace(/%/g, "%%")}" %*\r\n`;
}

// The shell script serves macOS, Linux, and Git Bash on Windows. ag.cmd serves PowerShell and cmd.
const LAUNCHER_FILES = [
  { name: "ag", marker: "# ag launcher", text: shellLauncher },
  ...(WINDOWS ? [{ name: "ag.cmd", marker: "@rem ag launcher", text: cmdLauncher }] : []),
];

// What sits at one Launcher path: missing, a Launcher that is current or old, a link into this store's sync/bin/
// from before Launchers, or a foreign file that ag leaves alone, like a Blocker.
function inspectLauncher(file) {
  const path = join(LAUNCHER_DIR, file.name);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) {
    return { path, state: "missing" };
  }
  // Any other link is foreign, so a write never goes through it into a file ag does not own.
  if (stat.isSymbolicLink()) {
    const real = existsSync(path) ? realpathOrSelf(path) : "";
    return foldCase(real) === foldCase(storeScript(SYNC_TOOL)) ? { path, state: "link" } : { path, state: "foreign" };
  }
  const text = stat.isFile() ? readFileSync(path, "utf8") : "";
  if (!lines(text).includes(file.marker)) {
    return { path, state: "foreign" };
  }
  const executable = WINDOWS || stat.mode & 0o111;
  return { path, state: text === file.text() && executable ? "current" : "old" };
}

const LAUNCHER_ACTIONS = {
  missing: ["create", "created", (path) => `Launcher ${path}`],
  old: ["update", "updated", (path) => `Launcher ${path}`],
  link: ["replace", "replaced", (path) => `the link ${path} with a Launcher`],
};

// Quoted, because a home folder can hold a space, such as C:\Users\Jane Doe.
function nodeCommand() {
  return `node "${storeScript(SYNC_TOOL)}" <command>`;
}

// The Launcher runs the Sync tool with whichever node comes first on PATH. It is a small step beside Sync,
// and no problem with it ever stops a command.
function ensureLauncher() {
  for (const file of LAUNCHER_FILES) {
    try {
      writeLauncherFile(file);
    } catch (error) {
      log(
        "warn",
        `ag could not write the Launcher ${display(join(LAUNCHER_DIR, file.name))} (${error.code ?? error.message}). Run ag as: ${nodeCommand()}`,
      );
    }
  }
  try {
    if (WINDOWS) {
      addToWindowsUserPath();
    } else if (!launcherDirOnPath()) {
      log("warn", `${display(LAUNCHER_DIR)} is not on PATH, so the ag command is not found. ${pathHint()}`);
    }
    for (const warning of otherAgWarnings()) {
      log("warn", warning);
    }
  } catch (error) {
    log("warn", `ag could not check PATH for the Launcher (${error.message}).`);
  }
}

function writeLauncherFile(file) {
  const { path, state } = inspectLauncher(file);
  if (state === "foreign") {
    log("warn", `${display(path)} is not an ag Launcher, so ag left it. Move it away, then run ag sync again. Until then, run ag as: ${nodeCommand()}`);
    return;
  }
  if (state === "current") {
    return;
  }
  const [verb, done, what] = LAUNCHER_ACTIONS[state];
  log(dryRun ? `would ${verb}` : done, `${what(display(path))}, which runs sync/bin/${SYNC_TOOL}`);
  if (dryRun) {
    return;
  }
  mkdirSync(LAUNCHER_DIR, { recursive: true });
  // A link is removed first, so the write never goes through it into the store.
  if (state === "link") {
    unlinkSync(path);
  }
  writeFileSync(path, file.text());
  chmodSync(path, 0o755);
}

const LAUNCHER_STATES = {
  current: (path) => `${path} runs sync/bin/${SYNC_TOOL}`,
  old: (path) => `${path} is from an older ag (run ag sync)`,
  link: (path) => `${path} is a link to sync/bin/${SYNC_TOOL} (run ag sync)`,
  missing: (path) => `${path} is missing (run ag sync)`,
  foreign: (path) => `${path} is not an ag Launcher. Move it away, then run ag sync.`,
};

// For ag status, which only reports.
function launcherStatusLines() {
  const files = LAUNCHER_FILES.map((file) => {
    const { path, state } = inspectLauncher(file);
    return LAUNCHER_STATES[state](display(path));
  });
  return [...files, ...launcherPathLines(), ...otherAgWarnings().map((warning) => `warning: ${warning}`)];
}

// This terminal's PATH decides whether ag is found. On Windows, a user PATH that already has the folder only
// needs a new terminal.
function launcherPathLines() {
  const folder = display(LAUNCHER_DIR);
  if (launcherDirOnPath()) {
    return [`${folder} is on PATH`];
  }
  if (!WINDOWS) {
    return [`${folder} is not on PATH. ${pathHint()}`];
  }
  try {
    return windowsUserPath({ reportOnly: true }) === "on-path"
      ? [`${folder} is on your user PATH. Open a new terminal, so it finds the ag command.`]
      : [`${folder} is not on PATH (run ag sync)`];
  } catch (error) {
    return [`ag could not read your user PATH (${error.message})`];
  }
}

// A PATH entry can be a file or an unreadable folder, which is no reason to fail.
function isCommand(path) {
  try {
    const stat = statSync(path, { throwIfNoEntry: false });
    return Boolean(stat?.isFile() && (WINDOWS || stat.mode & 0o111));
  } catch {
    return false;
  }
}

// npm links ag as <prefix>/bin/ag -> ../lib/node_modules/ag/bin/ag.mjs, and on Windows writes shims that name that path.
// npm rm -g ag leaves them behind once the package has no bin entry, so a dangling link counts too.
const NPM_LINK = /node_modules[\\/]ag[\\/]bin[\\/]ag\.mjs/;

// An npm link of ag, or a link made by hand into this store.
function isStoreLink(path) {
  try {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return false;
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(path);
      return (
        NPM_LINK.test(target) ||
        insideRoot(STORE_ROOT, realpathOrSelf(path)) !== null ||
        insideRoot(STORE_ROOT, resolve(dirname(path), target)) !== null
      );
    }
    return stat.isFile() && stat.size < 4096 && NPM_LINK.test(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

// Every ag command on PATH outside the Launcher's files, with each folder that links this store's ag named once.
// PowerShell runs ag.ps1 though PATHEXT leaves it out. ag only reads them, and never deletes one.
function otherAgCommands() {
  const extensions = WINDOWS ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [];
  const names = [
    ...new Set(["ag", ...extensions.map((extension) => `ag${extension.toLowerCase()}`), ...(WINDOWS ? ["ag.ps1"] : [])]),
  ];
  const dirs = pathDirs();
  const launcherIndex = dirs.findIndex((dir) => samePath(dir, LAUNCHER_DIR));
  const launcherNames = LAUNCHER_FILES.map((file) => file.name);
  return dirs.flatMap((dir, index) => {
    const paths = names
      .filter((name) => index !== launcherIndex || !launcherNames.includes(name))
      .map((name) => join(dir, name));
    const links = paths.filter(isStoreLink);
    const commands = paths
      .filter((path) => !links.includes(path) && isCommand(path))
      .map((path) => ({
        path,
        dir,
        besideLauncher: index === launcherIndex,
        beforeLauncher: launcherIndex === -1 || index < launcherIndex,
      }));
    return links.length ? [{ dir, links }, ...commands] : commands;
  });
}

// A foreign ag after the Launcher never runs in its place, so it gets no warning.
function otherAgWarnings() {
  return otherAgCommands().flatMap(({ path, dir, links, besideLauncher, beforeLauncher }) => {
    if (links) {
      return [
        `${display(dir)} holds an old npm link of ag, or another link to this store's ag. Remove it: run npm rm -g ag with the Node version of ${display(dir)}, then delete ${links.map(display).join(", ")} if still there.`,
      ];
    }
    // On Windows, PATHEXT can pick ag.exe or ag.bat over ag.cmd in the same folder.
    if (besideLauncher) {
      return [`${display(path)} is another ag command in the Launcher's folder, so it may run in place of ag. Move it away.`];
    }
    if (beforeLauncher) {
      return [
        `${display(path)} is another ag command, and it comes before the Launcher on PATH, so it runs in place of ag. Check with whence -p ag in zsh or type -a ag in bash, and put ${display(LAUNCHER_DIR)} before ${display(dir)} on PATH.`,
      ];
    }
    return [];
  });
}

// Reads and writes only the user PATH, never the merged process PATH, and never with setx, which cuts it short.
// PowerShell changes the value itself, so it never passes through a console encoding. It prints one word.
const WINDOWS_USER_PATH_SCRIPT = `$dir = $env:AG_LAUNCHER_DIR
$parts = @(([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ })
if ($parts | Where-Object { $_.TrimEnd('\\') -eq $dir }) { 'on-path'; exit }
if ($env:AG_REPORT_ONLY) { 'missing'; exit }
[Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User')
'added'`;

// Returns on-path, missing, or added. With reportOnly, it changes nothing.
function windowsUserPath({ reportOnly }) {
  const encoded = Buffer.from(WINDOWS_USER_PATH_SCRIPT, "utf16le").toString("base64");
  const result = runTool("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    encoding: "utf8",
    env: { ...process.env, AG_LAUNCHER_DIR: LAUNCHER_DIR, AG_REPORT_ONLY: reportOnly ? "1" : "" },
  });
  const answer = (result.stdout ?? "").trim();
  if (result.error || result.status !== 0 || !["on-path", "missing", "added"].includes(answer)) {
    throw new Error(result.error?.message ?? ((result.stderr ?? "").trim() || `exit ${result.status}`));
  }
  return answer;
}

function addToWindowsUserPath() {
  const folder = display(LAUNCHER_DIR);
  try {
    const answer = windowsUserPath({ reportOnly: dryRun });
    if (answer === "added") {
      log("added", `${folder} to your user PATH. Open a new terminal, so it finds the ag command.`);
    } else if (answer === "missing") {
      log("would add", `${folder} to your user PATH`);
    }
  } catch (error) {
    log("warn", `ag could not add ${folder} to your user PATH (${error.message}). Add it by hand, or run ag as: ${nodeCommand()}`);
  }
}

function samePath(a, b) {
  return foldCase(realpathOrSelf(expandPath(a))) === foldCase(realpathOrSelf(b));
}

// The folders on PATH, each once, in order.
function pathDirs() {
  const dirs = [];
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    if (entry && !dirs.some((dir) => samePath(entry, dir))) {
      dirs.push(realpathOrSelf(expandPath(entry)));
    }
  }
  return dirs;
}

function launcherDirOnPath() {
  return pathDirs().some((dir) => samePath(dir, LAUNCHER_DIR));
}

// ag never edits a startup file. It names the line and the file for the user's shell.
function pathHint() {
  const shell = basename(process.env.SHELL ?? "");
  const exportLine = 'export PATH="$HOME/.local/bin:$PATH"';
  if (shell === "fish") {
    return "Run this once in fish, then open a new terminal:\n  fish_add_path ~/.local/bin";
  }
  const file = { zsh: "~/.zshrc", bash: "~/.bash_profile" }[shell] ?? "your shell's startup file";
  return `Add this line to ${file}, then open a new terminal:\n  ${exportLine}`;
}

// Turns a fresh clone of the Upstream store into the user's own store. Safe to rerun after a failure.
function runInit(args) {
  const [url, ...extra] = args;
  if (extra.length || url?.startsWith("--")) {
    throw new Error("Usage: ag init [<url>]");
  }
  const strayBranch = git(["for-each-ref", "--format=%(refname:short)", "refs/heads"]).out
    .split("\n")
    .find((branch) => branch && branch !== CORE_BRANCH);
  if (currentBranch() !== CORE_BRANCH || strayBranch) {
    throw new Error(`ag init sets up a fresh clone that has only ${CORE_BRANCH}. ${display(STORE_ROOT)} already has profiles.`);
  }
  assertCheckoutsReady();

  if (!hasRemote(UPSTREAM)) {
    if (!hasOrigin()) {
      throw new Error("no origin remote. Clone the Upstream store first: git clone <upstream-url> ~/.agents");
    }
    const target = url ?? createRepoWithGh();
    git(["remote", "rename", "origin", UPSTREAM]);
    git(["remote", "add", "origin", target]);
  } else if (url) {
    git(["remote", hasOrigin() ? "set-url" : "add", "origin", url]);
  } else if (!hasOrigin()) {
    git(["remote", "add", "origin", createRepoWithGh()]);
  }
  remoteBranches = null;
  git(["branch", "--unset-upstream", CORE_BRANCH], { allowFail: true });
  ensureHooksPath();

  const pushFailed = new Error(
    `Pushing ${CORE_BRANCH} to ${remoteUrl("origin")} failed. Run ag init <url> again with the right URL.`,
  );
  let ahead;
  try {
    ahead = aheadOfOrigin(CORE_BRANCH, STORE_ROOT);
  } catch {
    throw pushFailed;
  }
  if (ahead && !gitVisible(["push", "-u", "origin", CORE_BRANCH], STORE_ROOT)) {
    throw pushFailed;
  }
  ensureLauncher();

  console.log(`Your store pushes to ${remoteUrl("origin")} and takes Core updates from ${remoteUrl(UPSTREAM)}.`);
  // In the terminal that ran ag init, ag is found only when the Launcher's folder was already on PATH.
  const ag = launcherDirOnPath() ? "ag" : `node "${storeScript(SYNC_TOOL)}"`;
  console.log(`Next: ${ag} new <name> creates your first profile.`);
}

// Follows symlinks and restores the on-disk letter case, which macOS ignores when it opens a file.
// A path that does not exist yet keeps its missing tail, appended to its deepest existing folder.
function canonicalPath(absolute) {
  let existing = absolute;
  const missing = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      return absolute;
    }
    missing.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync.native(existing), ...missing);
}

function insideRoot(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)) ? rel : null;
}

// A relative path resolves from the current directory inside a checkout, otherwise from the store root.
function storeRelativePath(input) {
  const expanded = expandPath(input);
  const roots = [STORE_ROOT, EDIT_WORKTREE].filter(existsSync).map((root) => realpathSync.native(root));
  const fromCwd = canonicalPath(resolve(process.cwd(), expanded));
  for (const root of roots) {
    const rel = insideRoot(root, fromCwd);
    if (rel !== null) {
      return rel;
    }
  }

  const rel = isAbsolute(expanded) ? null : insideRoot(roots[0], canonicalPath(resolve(roots[0], expanded)));
  if (rel === null) {
    throw new Error(`${input} is not inside ${display(STORE_ROOT)} or ${display(EDIT_WORKTREE)}`);
  }
  return rel;
}

// The local branch, or origin's copy when there is no local branch yet, as on a fresh clone.
function branchRef(branch) {
  if (localBranchExists(branch)) {
    return branch;
  }
  const remote = `refs/remotes/origin/${branch}`;
  return git(["rev-parse", "--verify", "-q", remote], { allowFail: true }).ok ? remote : null;
}

function profileExists(profile) {
  if (branchRef(profile)) {
    return true;
  }
  try {
    return remoteHasBranch(profile);
  } catch {
    return false;
  }
}

function ownerOf(rel) {
  const parts = rel.split(/[\\/]/).filter((part) => part && part !== ".");

  if (parts[0] === "profiles" && parts[1] && !parts[1].startsWith(".")) {
    const profile = parts[1];
    assertProfileName(profile);
    if (profile === CORE_BRANCH || !profileExists(profile)) {
      throw new Error(`No profile "${profile}".`);
    }
    return profile;
  }
  if (parts[0] === "profiles" || parts[0] === ".skill-lock.json") {
    return readActiveProfile();
  }
  if (parts[0] === "skills") {
    const active = readActiveProfile();
    if (!parts[1]) {
      return active;
    }
    return (
      lineage(active).find((branch) => {
        const ref = branchRef(branch);
        return ref && treeHas(ref, `skills/${parts[1]}`);
      }) ?? active
    );
  }
  return CORE_BRANCH;
}

// Core is read-only in a store with an Upstream store. Its own Core commits would conflict with later
// Core changes from the Upstream store, so ag points every Core edit somewhere else.
function refuseCoreEdit(rel, error) {
  const url = remoteUrl(UPSTREAM);
  let profile = "<profile>";
  try {
    profile = readActiveProfile();
  } catch {}
  const storeArtifact = rel?.match(/^artifacts\/(skills|commands|rules|subagents)-(?:store|core)-me\/(.+)$/);
  const profileTarget = storeArtifact
    ? `profiles/${profile}/artifacts/${storeArtifact[1]}-profile-me/${storeArtifact[2]}`
    : `profiles/${profile}/artifacts/<kind>-profile-me/`;
  console.log(`Core comes from the Upstream store, ${url}. Only ag update changes it in this store.`);
  console.log(`- A profile artifact goes in a profile: ${profileTarget}`);
  console.log("- For a change to ag, the docs, or the runtime mappings, file a Core issue: ag issue bug|idea");
  console.log(`- To own Core in this store instead, run: git -C ${display(STORE_ROOT)} remote remove upstream`);
  console.log(`  ag update then stops taking Core from ${url}.`);
  throw new Error(error);
}

function runOwner(input) {
  if (!input) {
    throw new Error("Usage: ag owner <path>");
  }
  const rel = storeRelativePath(input).split(/[\\/]/).filter((part) => part && part !== ".").join("/");
  const owner = ownerOf(rel);
  if (owner === CORE_BRANCH && hasRemote(UPSTREAM)) {
    refuseCoreEdit(rel, `${rel || "."} is Core, which is read-only in this store (see above).`);
  }
  console.log(`Path:     ${rel || "."}`);
  console.log(`Branch:   ${owner}`);
  if (currentBranch() === owner) {
    console.log(`Checkout: ${display(STORE_ROOT)}`);
  } else if (editWorktree()?.branch === owner) {
    console.log(`Checkout: ${display(EDIT_WORKTREE)} (already on ${owner})`);
  } else {
    console.log(`Checkout: ${display(EDIT_WORKTREE)} (run ag edit ${owner} first)`);
  }
}

function runEdit(branch) {
  assertProfileName(branch);
  if (branch === CORE_BRANCH && hasRemote(UPSTREAM)) {
    refuseCoreEdit(null, `${CORE_BRANCH} is the Core branch, which is read-only in this store (see above).`);
  }
  assertOrigin();
  assertCheckoutsReady();
  if (currentBranch() === branch) {
    throw new Error(`${branch} is checked out in ${display(STORE_ROOT)}. Edit it there.`);
  }
  ensureLocalBranch(branch);
  ensureEditWorktree();
  switchEditWorktree(branch);
  if (isPushable(branch) && remoteHasBranch(branch)) {
    mergeStep(["pull", "origin", branch, "--no-rebase", "--no-edit"], EDIT_WORKTREE, branch);
  }
  console.log(`Edit worktree: ${display(EDIT_WORKTREE)} on ${branch}`);
}

function parseSkillsAddArgs(args) {
  const options = { url: null, skill: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--skill") {
      options.skill = args[index + 1];
      index += 1;
    } else if (!options.url && !arg.startsWith("--")) {
      options.url = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.url) {
    throw new Error("Usage: ag skills add <url> [--skill <name>]");
  }
  return options;
}

async function runSkillsAdd(args) {
  const { url, skill } = parseSkillsAddArgs(args);
  assertOrigin();
  activeBranch();
  assertCheckoutsReady();
  if (realpathOrSelf(join(homedir(), ".agents")) !== STORE_ROOT) {
    throw new Error(`The skills installer writes to ~/.agents/skills, but the store is ${STORE_ROOT}.`);
  }

  const npxArgs = skill
    ? ["skills", "add", url, "--skill", skill, "--yes", "--agent", "amp", "-g"]
    : ["skills", "add", url, "--agent", "amp", "-g"];
  const result = runTool("npx", npxArgs, { cwd: STORE_ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`npx ${npxArgs.join(" ")} failed`);
  }

  for (const path of ["skills", ".skill-lock.json"]) {
    if (existsSync(join(STORE_ROOT, path))) {
      git(["add", "-A", "--", path]);
    }
  }
  const changed = git(["diff", "--cached", "--name-only", "--", "skills"]).out;
  const names = [
    ...new Set(changed.split("\n").filter(Boolean).map((path) => path.split("/")[1])),
  ];
  if (!names.length && !git(["diff", "--cached", "--name-only"]).out) {
    log("info", "The installer changed nothing.");
    runSync();
    return;
  }

  const label = names.length ? names.join(", ") : "skills";
  git(["commit", "-q", "-m", `Add skill${names.length > 1 ? "s" : ""} ${label}`]);
  log("committed", `Add skill${names.length > 1 ? "s" : ""} ${label}`);
  pushBranch(currentBranch(), STORE_ROOT);
  await runUpdate();
}

// The headings match what the issue forms in .github/ISSUE_TEMPLATE produce, so triage reads one shape.
const ISSUE_KINDS = {
  bug: { label: "bug", required: ["What happened", "What you expected"], optional: ["OS"] },
  idea: { label: "enhancement", required: ["Problem", "Proposed change"], optional: [] },
};
const ISSUE_USAGE = "Usage: ag issue bug|idea --title <title> --body-file <path> [--yes]";

function parseIssueArgs(args) {
  const [kind, ...rest] = args;
  if (!ISSUE_KINDS[kind]) {
    throw new Error(ISSUE_USAGE);
  }
  const options = { kind, title: null, bodyFile: null, yes: false };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--yes") {
      options.yes = true;
    } else if ((arg === "--title" || arg === "--body-file") && rest[index + 1] !== undefined) {
      options[arg === "--title" ? "title" : "bodyFile"] = rest[index + 1];
      index += 1;
    } else {
      throw new Error(`Unexpected argument: ${arg}. ${ISSUE_USAGE}`);
    }
  }
  if (!options.title?.trim() || !options.bodyFile) {
    throw new Error(ISSUE_USAGE);
  }
  return options;
}

function readIssueBody(kind, bodyFile) {
  const path = resolve(bodyFile);
  if (!existsSync(path)) {
    throw new Error(`No body file at ${path}`);
  }
  const body = readFileSync(path, "utf8").trim();
  const { required, optional } = ISSUE_KINDS[kind];
  const headings = [...body.matchAll(/^###[ \t]+(.+?)[ \t]*$/gm)].map((match) => match[1]);
  const missing = required.filter((heading) => !headings.includes(heading));
  const unknown = headings.filter((heading) => ![...required, ...optional].includes(heading));
  if (missing.length || unknown.length) {
    const shape = [...required, ...optional.map((heading) => `${heading} (optional)`)]
      .map((heading) => `### ${heading}`)
      .join(", ");
    const problems = [
      missing.length ? `missing ${missing.map((heading) => `### ${heading}`).join(", ")}` : null,
      unknown.length ? `unknown ${unknown.map((heading) => `### ${heading}`).join(", ")}` : null,
    ].filter(Boolean);
    throw new Error(`The ${kind} body is ${problems.join("; ")}. Use these headings: ${shape}.`);
  }
  return body;
}

// Reads https, ssh, and scp-style remote URLs. A local path is not a GitHub repository.
function githubRepo(url) {
  const match = url.match(/^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^/:]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match || !match[1].includes(".") || existsSync(url)) {
    throw new Error(`${url} is not a GitHub repository, so ag issue cannot file there.`);
  }
  const [, host, owner, repo] = match;
  return { host, name: `${owner}/${repo}` };
}

// A Core issue goes to the store that owns Core: the Upstream store, or this store when it has none.
function coreIssueTarget() {
  const remote = hasRemote(UPSTREAM) ? UPSTREAM : "origin";
  if (!hasRemote(remote)) {
    throw new Error("no origin remote, so there is no issue tracker for Core issues.");
  }
  return { remote, ...githubRepo(remoteUrl(remote)) };
}

function assertGh() {
  if (!toolAvailable("gh")) {
    throw new Error("The GitHub CLI (gh) is not installed, so ag issue cannot file the issue. Install it, then run gh auth login.");
  }
  if (!toolAvailable("gh", ["auth", "status"])) {
    throw new Error("gh is not signed in. Run gh auth login, then ag issue again.");
  }
}

// GitHub keeps a label on a new issue only from someone with push access, so ag sends it only then.
// Without it, the triage-label workflow marks the issue needs-triage and triage sets the category.
function canPush(target) {
  const result = runTool(
    "gh",
    ["api", `repos/${target.name}`, "--hostname", target.host, "--jq", ".permissions.push"],
    { encoding: "utf8" },
  );
  return result.status === 0 && result.stdout.trim() === "true";
}

function runIssue(args) {
  const { kind, title, bodyFile, yes } = parseIssueArgs(args);
  const body = readIssueBody(kind, bodyFile);
  const target = coreIssueTarget();
  const owner = target.remote === UPSTREAM ? "the Upstream store" : "this store";

  if (!yes) {
    console.log(`Repository: ${target.host}/${target.name} (${owner}, which owns Core)`);
    console.log(`Kind:       ${kind}`);
    console.log(`Title:      ${title}`);
    console.log("Body:");
    console.log(body.replace(/^/gm, "  "));
    console.log("");
    console.log("Nothing was filed. The repository may be public, so check the body for private content.");
    console.log("Show this preview to the user. After they approve it, run the same command with --yes.");
    return;
  }

  assertGh();
  const ghArgs = ["issue", "create", "-R", `${target.host}/${target.name}`, "--title", title, "--body-file", resolve(bodyFile)];
  if (canPush(target)) {
    ghArgs.push("--label", ISSUE_KINDS[kind].label);
  }
  const result = runTool("gh", ghArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`gh issue create failed: ${(result.stderr ?? "").trim()}`);
  }
  log("created", `${kind} issue ${result.stdout.trim().split("\n").pop().trim()}`);
}

function runProtect(profile) {
  assertProfileName(profile);
  if (profile === CORE_BRANCH) {
    throw new Error(`${CORE_BRANCH} is the Core branch, not a profile.`);
  }

  const hook = join(STORE_ROOT, HOOKS_PATH, "pre-push");
  if (!existsSync(hook)) {
    throw new Error(`Missing ${hook}`);
  }
  chmodSync(hook, 0o755);

  git(["config", "core.hooksPath", HOOKS_PATH]);
  if (!protectedProfiles().includes(profile)) {
    git(["config", "--add", "ag.noPush", profile]);
  }
  git(["config", `branch.${profile}.pushRemote`, "no_push"]);

  log("info", `Protected profile "${profile}"`);
  log("info", `Protected profiles: ${protectedProfiles().join(", ")}`);
}

function runStatus() {
  const branch = currentBranch() || "(detached)";
  console.log(`Store root:      ${display(STORE_ROOT)}`);
  console.log(`Branch:          ${branch}`);
  console.log(
    `Core:            ${hasRemote(UPSTREAM) ? `read-only, from ${remoteUrl(UPSTREAM)}` : "owned by this store"}`,
  );

  let profile = null;
  try {
    profile = readActiveProfile();
  } catch {
    console.log("Active profile:  none (run ag use <profile> or ag new <name>)");
  }
  if (profile) {
    console.log(`Active profile:  ${profile}`);
    if (branch !== profile) {
      console.log("                 note: branch name differs from ACTIVE_PROFILE");
    }
    console.log(`Lineage:         ${[CORE_BRANCH, ...lineage(profile)].join(" → ")}`);
    const { core, levels } = migrationLevels(profile);
    const pending = levels.some(({ level }) => level < core);
    console.log(
      `Migration level: ${levels.map(({ name, level }) => `${name} ${level}/${core}`).join(", ")}${pending ? " (run ag update)" : ""}`,
    );
  }

  const edit = editWorktree();
  console.log(
    `Edit worktree:   ${edit ? `${display(edit.path)} on ${edit.branch ?? "(detached)"} (${isDirty(edit.path) ? "uncommitted changes" : "clean"})` : "none"}`,
  );

  const hooksPath = git(["config", "--get", "core.hooksPath"], {
    allowFail: true,
  }).out;
  const protectedList = protectedProfiles();
  console.log(
    `Protected:       ${protectedList.length ? protectedList.join(", ") : "none"}${protectedList.length && hooksPath !== HOOKS_PATH ? " (warning: core.hooksPath is not .githooks)" : ""}`,
  );

  const indent = "                 ";
  launcherStatusLines().forEach((line, index) =>
    console.log(`${index ? indent : "Launcher:        "}${line.replaceAll("\n", `\n${indent}`)}`),
  );

  if (profile) {
    const plan = syncPlan(profile, { quiet: true });
    const stale = findStaleSymlinks(plan);
    console.log(
      `Symlinks:        ${stale.length ? `${stale.length} out of date — run ag sync` : "up to date"}`,
    );
    for (const path of stale) {
      console.log(`                 ${path}`);
    }
    const staleDerived = findStaleDerived(plan);
    console.log(
      `Derived files:   ${staleDerived.length ? `out of date: ${staleDerived.join(", ")}. Run ag sync.` : "up to date"}`,
    );
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  dryRun = args.includes("--dry-run");
  // An Edit worktree folder deleted by hand would otherwise break every git call that lists it.
  git(["worktree", "prune"], { allowFail: true });

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    case "init":
      runInit(args);
      return;
    case "new":
      await runNew(args);
      return;
    case "use":
      runUse(args[0]);
      return;
    case "sync":
      runSync();
      return;
    case "status":
      runStatus();
      return;
    case "setup":
      runSetup();
      return;
    case "owner":
      runOwner(args[0]);
      return;
    case "edit":
      runEdit(args[0]);
      return;
    case "push":
      runPush();
      return;
    case "update":
      await runUpdate();
      return;
    case "skills":
      if (args[0] !== "add") {
        throw new Error("Usage: ag skills add <url> [--skill <name>]");
      }
      await runSkillsAdd(args.slice(1));
      return;
    case "protect":
      runProtect(args[0]);
      return;
    case "issue":
      runIssue(args);
      return;
    default:
      console.error(`error: unknown command "${command}"\n`);
      console.log(HELP);
      process.exit(1);
  }
}

try {
  await main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(error.exitCode ?? 1);
}
