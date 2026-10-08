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
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = findStoreRoot();
const EDIT_WORKTREE = `${STORE_ROOT}-edit`;
const PROFILES_DIR = join(STORE_ROOT, "profiles");
const ACTIVE_FILE = join(PROFILES_DIR, ".env.active");
const RUNTIMES_FILE = join(STORE_ROOT, "sync", "runtimes.yaml");
const CORE_BRANCH = "main";
const UPSTREAM = "upstream";
const HOOKS_PATH = ".githooks";
const KINDS = ["skills", "commands", "rules", "subagents"];
const PROFILE_NAME = /^[A-Za-z0-9._-]+$/;
const EXCLUDE_HEADER = "# ag: local files listed in profile.yaml";

let dryRun = false;

const HELP = `ag — manage the ~/.agents store

Usage:
  ag help                         Show this help.
  ag init [<url>]                 Turn a fresh clone into your own store: upstream for Core, origin for your pushes.
  ag new <name> [--from <parent>] [--protect] [--clean]
                                  Create a profile branch from main, or from a parent profile.
                                  --clean creates a clean profile from main, which links no store artifacts.
  ag use <profile>                Check out the profile's branch, then sync.
  ag sync [--dry-run]             Recreate the symlinks in every coding agent for the Active profile's Lineage.
  ag status                       Show whether Core is read-only, the Active profile, Lineage, Edit worktree,
                                  protection, and symlinks.
  ag setup                        Name the Active profile's setup skill, or print the prompt to create it.
                                  A clean profile needs no setup.
  ag owner <path>                 Print the store path, the branch that owns it, and where to edit it.
                                  A relative path is resolved from the current directory.
  ag edit <branch>                Switch the Edit worktree to a branch.
  ag push                         Push the branches of ~/.agents and the Edit worktree, except local-only ones.
  ag update                       Fast-forward main from upstream if there is one, push main if needed,
                                  merge every Lineage branch with its parent, top down, then sync.
  ag skills add <url> [--skill <name>]
                                  Install third-party skills into the Active profile, commit, push, update.
  ag protect <profile>            Block pushes that contain the profile's commits (once per clone).

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
  const config = { parent: null, clean: false, localFiles: [] };

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

function serializeProfileYaml({ parent, clean, localFiles }) {
  const lines = [`parent: ${parent}`];
  if (clean) {
    lines.push("clean: true");
  }
  if (localFiles.length) {
    lines.push(`local-files: [${localFiles.join(", ")}]`);
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

function parseRuntimesYaml(content) {
  const runtimes = {};
  let runtime = null;
  let section = null;

  for (const rawLine of lines(content)) {
    const line = stripComment(rawLine);
    if (!line.trim()) {
      continue;
    }

    let match = line.match(/^([A-Za-z0-9_-]+):$/);
    if (match) {
      runtime = { home: null, targets: {}, linkExt: {} };
      runtimes[match[1]] = runtime;
      section = null;
      continue;
    }
    if (!runtime) {
      throw new Error(`Unable to parse runtimes.yaml line: ${line.trim()}`);
    }

    match = line.match(/^  home:\s*(\S+)$/);
    if (match) {
      runtime.home = match[1];
      section = null;
      continue;
    }

    match = line.match(/^  (targets|link-ext):$/);
    if (match) {
      section = match[1];
      continue;
    }

    match = line.match(/^    ([a-z]+):\s*(\S+)$/);
    if (match && section) {
      const [, kind, value] = match;
      if (!KINDS.includes(kind)) {
        throw new Error(`runtimes.yaml: unknown artifact kind "${kind}"`);
      }
      if (section === "targets") {
        runtime.targets[kind] = value;
      } else {
        if (!/^\.[A-Za-z0-9]+$/.test(value)) {
          throw new Error(`runtimes.yaml: link-ext must look like ".md": ${value}`);
        }
        runtime.linkExt[kind] = value;
      }
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

function sourcesFor(kind, chain, { clean }) {
  return [
    ...(kind === "skills" ? ["skills"] : []),
    ...(clean ? [] : [`artifacts/${kind}-store-me`]),
    ...chain.map((profile) => `profiles/${profile}/artifacts/${kind}-profile-me`),
  ];
}

function linkPlan(profile) {
  const chain = lineage(profile);
  const runtimes = loadRuntimes();
  const { clean } = readProfileConfig(profile);

  return Object.entries(runtimes).map(([name, runtime]) => ({
    name,
    home: runtime.home,
    links: KINDS.filter((kind) => runtime.targets[kind]).map((kind) => ({
      kind,
      sources: sourcesFor(kind, chain, { clean }),
      target: runtime.targets[kind],
      linkExt: runtime.linkExt[kind],
    })),
  }));
}

const OS_METADATA = new Set(["desktop.ini", "thumbs.db"]);

function listArtifacts(sourceDir) {
  return readdirSync(sourceDir).filter(
    (name) => !name.startsWith(".") && !OS_METADATA.has(name.toLowerCase()),
  );
}

// With linkExt, a file link gets that extension (x.mdc -> x.md). Directory links keep their name.
function linkNameFor(name, sourcePath, linkExt) {
  if (!linkExt || statSync(sourcePath).isDirectory()) {
    return name;
  }
  return name.replace(/(\.[^.]+)?$/, linkExt);
}

function collectArtifacts(sources, { quiet = false, linkExt } = {}) {
  const artifacts = new Map();
  // Keyed by lower case, because macOS and Windows treat Foo and foo as one file.
  const sourceOf = new Map();
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

    for (const name of listArtifacts(sourceDir)) {
      const sourcePath = resolve(sourceDir, name);
      const linkName = linkNameFor(name, sourcePath, linkExt);
      const key = linkName.toLowerCase();
      if (sourceOf.has(key)) {
        throw new Error(
          `Collision: "${linkName}" comes from both "${sourceOf.get(key)}" and "${source}"`,
        );
      }

      sourceOf.set(key, source);
      artifacts.set(linkName, { name, linkName, source, sourcePath });
    }
  }

  return { artifacts, existingSourceCount };
}

function removeSymlinks(targetDir) {
  if (!existsSync(targetDir)) {
    return [];
  }

  const removed = [];

  for (const name of readdirSync(targetDir)) {
    const entryPath = join(targetDir, name);
    if (lstatSync(entryPath).isSymbolicLink()) {
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
function findRealEntries(mappings) {
  const blockers = [];
  const unmanaged = [];
  for (const { link, targetDir, artifacts } of mappings) {
    if (!existsSync(targetDir)) {
      continue;
    }
    const names = new Set([...artifacts.keys()].map((name) => name.toLowerCase()));
    for (const name of listArtifacts(targetDir)) {
      const path = join(targetDir, name);
      if (lstatSync(path).isSymbolicLink()) {
        continue;
      }
      (names.has(name.toLowerCase()) ? blockers : unmanaged).push({ path, kind: link.kind });
    }
  }
  return { blockers, unmanaged };
}

function artifactFolder(profile, kind) {
  return `profiles/${profile}/artifacts/${kind}-profile-me/`;
}

// Runs over every runtime before any link changes, so one Blocker anywhere leaves every runtime as it was.
function checkTargets(mappings, profile) {
  const { blockers, unmanaged } = findRealEntries(mappings);
  if (blockers.length) {
    throw new Error(
      [
        "Blocker: these real files or folders have the names of store artifacts, so ag sync changed nothing:",
        ...blockers.map(({ path, kind }) => `  ${display(path)} (${kind})`),
        `Delete each one, or rename it and move it into ${artifactFolder(profile, "<kind>")} to keep both. Then run ag sync again.`,
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
  for (const { targetDir } of mappings) {
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

// The mappings sync will apply, one per runtime target folder, with their artifacts collected.
function planMappings(plan) {
  const mappings = [];
  const runtimeNames = new Set();

  for (const runtime of plan) {
    const runtimeHome = expandPath(runtime.home);
    if (!existsSync(runtimeHome)) {
      log("warn", `Skipping "${runtime.name}" — home not found: ${runtimeHome}`);
      continue;
    }
    runtimeNames.add(runtime.name);

    for (const link of runtime.links) {
      const { artifacts, existingSourceCount } = collectArtifacts(link.sources, {
        linkExt: link.linkExt,
      });
      if (existingSourceCount === 0) {
        log(
          "warn",
          `Skipping "${runtime.name}" mapping to "${link.target}" — no source directories exist (${link.sources.join(", ")})`,
        );
        continue;
      }

      const targetDir = join(runtimeHome, link.target);
      if (ensureTargetDir(targetDir)) {
        log("info", `Created target directory: ${targetDir}`);
      }
      mappings.push({ link, targetDir, artifacts });
    }
  }

  return { mappings, runtimeCount: runtimeNames.size };
}

function syncMapping({ targetDir, artifacts }) {
  const removedLinks = removeSymlinks(targetDir);
  for (const entryPath of removedLinks) {
    log(dryRun ? "info" : "removed", `symlink ${entryPath}`);
  }

  for (const artifact of artifacts.values()) {
    const linkPath = join(targetDir, artifact.linkName);
    const stats = lstatSync(artifact.sourcePath);
    log(dryRun ? "would create" : "created", `symlink ${linkPath} -> ${artifact.sourcePath}`);
    createSymlink(artifact.sourcePath, linkPath, stats.isDirectory());
  }

  return { removed: removedLinks.length, created: artifacts.size };
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
  const plan = linkPlan(profile);
  let totalRemoved = 0;
  let totalCreated = 0;

  log("info", `Store root: ${STORE_ROOT}`);
  log("info", `Active profile: ${profile}`);
  if (dryRun) {
    log("info", "Dry run — no changes will be made");
  }

  ensureHooksPath();
  excludeLineageLocalFiles(profile);

  const { mappings, runtimeCount } = planMappings(plan);
  checkTargets(mappings, profile);
  for (const mapping of mappings) {
    const result = syncMapping(mapping);
    totalRemoved += result.removed;
    totalCreated += result.created;
  }

  log(
    "info",
    `Done — ${runtimeCount} runtime(s), ${totalRemoved} symlink(s) removed, ${totalCreated} symlink(s) ${dryRun ? "would be created" : "created"}`,
  );
}

// Returns runtime paths that differ from what ag sync would create.
function findStaleSymlinks(profile) {
  const stale = [];

  for (const runtime of linkPlan(profile)) {
    const runtimeHome = expandPath(runtime.home);
    if (!existsSync(runtimeHome)) {
      continue;
    }

    for (const link of runtime.links) {
      const { artifacts, existingSourceCount } = collectArtifacts(
        link.sources,
        { quiet: true, linkExt: link.linkExt },
      );
      if (existingSourceCount === 0) {
        continue;
      }

      const targetDir = join(runtimeHome, link.target);
      const actual = new Map();
      if (existsSync(targetDir)) {
        for (const name of readdirSync(targetDir)) {
          const entryPath = join(targetDir, name);
          if (lstatSync(entryPath).isSymbolicLink()) {
            actual.set(name, readlinkSync(entryPath));
          }
        }
      }

      for (const [name, artifact] of artifacts) {
        if (actual.get(name) !== artifact.sourcePath) {
          stale.push(join(targetDir, name));
        }
      }
      for (const name of actual.keys()) {
        if (!artifacts.has(name)) {
          stale.push(join(targetDir, name));
        }
      }
    }
  }

  return stale;
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

function updateBranch(branch, parent, cwd) {
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
function pushCoreIfAhead() {
  if (!localBranchExists(CORE_BRANCH) || !aheadOfOrigin(CORE_BRANCH, STORE_ROOT)) {
    return;
  }
  ensureEditWorktree();
  switchEditWorktree(CORE_BRANCH);
  log("info", `Updating ${CORE_BRANCH} in ${display(EDIT_WORKTREE)}`);
  if (remoteHasBranch(CORE_BRANCH)) {
    mergeStep(["pull", "origin", CORE_BRANCH, "--no-rebase", "--no-edit"], EDIT_WORKTREE, CORE_BRANCH);
  }
  pushBranch(CORE_BRANCH, EDIT_WORKTREE);
}

function runUpdate() {
  assertOrigin();
  const active = activeBranch();
  assertCheckoutsReady();

  const chain = lineage(active);
  fastForwardUpstreamCore();
  pushCoreIfAhead();

  for (let index = 0; index < chain.length; index += 1) {
    const branch = chain[index];
    const parent = index === 0 ? CORE_BRANCH : chain[index - 1];

    if (branch === active) {
      updateBranch(branch, parent, STORE_ROOT);
    } else {
      ensureLocalBranch(branch);
      ensureEditWorktree();
      switchEditWorktree(branch);
      updateBranch(branch, parent, EDIT_WORKTREE);
    }
  }

  parkEditWorktree();
  runSync();
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

  if (currentBranch() !== profile) {
    git(["switch", profile]);
    log("info", `Switched ${STORE_ROOT} to "${profile}"`);
  }

  const active = readActiveProfile();
  if (active !== profile) {
    log("warn", `Branch "${profile}" has ACTIVE_PROFILE=${active} in ${ACTIVE_FILE}`);
  }

  runSync();
  ensureEditWorktree();
}

function setupSkillPath(profile) {
  return `profiles/${profile}/artifacts/skills-profile-me/setup-${profile}/SKILL.md`;
}

function setupPrompt(profile) {
  return `Research the \`${profile}\` profile in \`${display(STORE_ROOT)}/profiles/${profile}/\`: its artifacts, references, and local files. Then create the \`setup-${profile}\` skill at \`${setupSkillPath(profile)}\`. The skill configures a profile created from \`${profile}\`, and \`${profile}\` itself on a new machine. \`ag new\` may have already copied the local files, such as \`.env\`, into the new profile. When a file the skill would create already exists, the skill shows its current values and asks the human whether they are correct. Check that \`local-files\` in \`profiles/${profile}/profile.yaml\` lists every local file the profile uses, and add any that are missing. The skill repeats that check every time it runs, and runs \`ag sync\` after it changes the list. If nothing needs configuring, the skill says that no extra setup is required.`;
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

function runNew(args) {
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

  const profileDir = join(PROFILES_DIR, name);
  if (existsSync(profileDir) && readdirSync(profileDir).length) {
    throw new Error(`${display(profileDir)} already exists on disk. Move it away first.`);
  }

  git(["switch", "-c", name, parent]);

  const localFiles = parentConfig?.localFiles ?? [];
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "profile.yaml"),
    serializeProfileYaml({ parent, clean, localFiles }),
  );
  for (const kind of KINDS) {
    const kindDir = join(profileDir, "artifacts", `${kind}-profile-me`);
    mkdirSync(kindDir, { recursive: true });
    writeFileSync(join(kindDir, ".gitkeep"), "");
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
  runUse(name);
  runUpdate();

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

function linkCli() {
  const result = runTool("npm", ["link"], { cwd: join(STORE_ROOT, "sync"), stdio: "inherit" });
  if (result.status === 0) {
    log("info", "Linked the ag command with npm link");
    return;
  }
  log("warn", `npm link failed. Run ag as: node ${join(STORE_ROOT, "sync", "bin", "ag.mjs")} <command>`);
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
  linkCli();

  console.log(`Your store pushes to ${remoteUrl("origin")} and takes Core updates from ${remoteUrl(UPSTREAM)}.`);
  console.log("Next: ag new <name> creates your first profile.");
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
  const storeArtifact = rel?.match(/^artifacts\/(skills|commands|rules|subagents)-store-me\/(.+)$/);
  const profileTarget = storeArtifact
    ? `profiles/${profile}/artifacts/${storeArtifact[1]}-profile-me/${storeArtifact[2]}`
    : `profiles/${profile}/artifacts/<kind>-profile-me/`;
  console.log(`Core comes from the Upstream store, ${url}. Only ag update changes it in this store.`);
  console.log(`- A store rule, skill, command, or subagent goes in a profile: ${profileTarget}`);
  console.log(`- For a change to ag, the docs, or the runtime mappings, open an issue on ${url}.`);
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

function runSkillsAdd(args) {
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
  runUpdate();
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

  if (profile) {
    const stale = findStaleSymlinks(profile);
    console.log(
      `Symlinks:        ${stale.length ? `${stale.length} out of date — run ag sync` : "up to date"}`,
    );
    for (const path of stale) {
      console.log(`                 ${path}`);
    }
  }
}

function main() {
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
      runNew(args);
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
      runUpdate();
      return;
    case "skills":
      if (args[0] !== "add") {
        throw new Error("Usage: ag skills add <url> [--skill <name>]");
      }
      runSkillsAdd(args.slice(1));
      return;
    case "protect":
      runProtect(args[0]);
      return;
    default:
      console.error(`error: unknown command "${command}"\n`);
      console.log(HELP);
      process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
