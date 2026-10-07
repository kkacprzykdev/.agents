import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORE_FILES = ["sync/bin/ag.mjs", "sync/runtimes.yaml", ".githooks/pre-push", ".gitattributes"];

// Hooks run with GIT_DIR and GIT_INDEX_FILE set. They must not leak into the throwaway repositories.
// os.homedir() reads USERPROFILE on Windows, so the fake home replaces every home variable.
function cleanEnv(overrides) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("GIT_") && !["HOMEDRIVE", "HOMEPATH"].includes(key.toUpperCase()),
    ),
  );
  return { ...env, ...overrides };
}

// A fake command in bin, written in JavaScript, with launchers for sh and for Windows.
function writeStub(bin, name, source) {
  writeFileSync(join(bin, `${name}.mjs`), source);
  writeFileSync(join(bin, name), `#!/bin/sh\nexec node "$(dirname "$0")/${name}.mjs" "$@"\n`);
  chmodSync(join(bin, name), 0o755);
  writeFileSync(join(bin, `${name}.cmd`), `@node "%~dp0${name}.mjs" %*\r\n`);
}

// Records each call as one JSON line in <name>.calls, next to the stub.
function recorder(name) {
  return `import { appendFileSync } from "node:fs";
appendFileSync(new URL("./${name}.calls", import.meta.url), JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
`;
}

function writeFile(root, rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function ok(result) {
  assert.equal(result.status, 0, `exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

export function fails(result) {
  assert.notEqual(result.status, 0, `expected a failure\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`;
}

// A throwaway world: a bare origin, a store at $HOME/.agents on main, and empty runtime homes.
export function createWorld() {
  // Native, so Windows short names in the temp folder (RUNNER~1) become the long names git reports.
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), "ag-test-")));
  const home = join(base, "home");
  const bin = join(base, "bin");
  const origin = join(base, "origin.git");
  const store = join(home, ".agents");
  const edit = `${store}-edit`;

  for (const dir of [join(home, ".cursor"), join(home, ".claude"), bin, store]) {
    mkdirSync(dir, { recursive: true });
  }

  const env = cleanEnv({
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
    GIT_TERMINAL_PROMPT: "0",
    PATH: `${bin}${delimiter}${process.env.PATH}`,
  });
  // A real npm link would change the machine's global packages, and a real gh could create repositories.
  writeStub(bin, "npm", recorder("npm"));
  writeStub(bin, "gh", "process.exit(1);\n");

  const run = (command, args, cwd) =>
    spawnSync(command, args, { cwd, env, encoding: "utf8" });

  const git = (cwd, ...args) => {
    const result = run("git", args, cwd);
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} in ${cwd}: ${result.stderr}${result.stdout}`);
    }
    return result.stdout.trim();
  };

  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(store, "init", "-q", "-b", "main");
  for (const rel of CORE_FILES) {
    mkdirSync(dirname(join(store, rel)), { recursive: true });
    copyFileSync(join(REPO, rel), join(store, rel));
  }
  chmodSync(join(store, ".githooks/pre-push"), 0o755);
  for (const kind of ["skills", "commands", "rules", "subagents"]) {
    writeFile(store, `artifacts/${kind}-store-me/.gitkeep`, "");
  }
  writeFile(store, "artifacts/rules-store-me/store-rule.mdc", "store rule\n");
  writeFile(store, ".gitignore", ".DS_Store\n");
  git(store, "add", "-A");
  git(store, "commit", "-q", "-m", "Core");
  git(store, "remote", "add", "origin", origin);
  git(store, "push", "-q", "-u", "origin", "main");

  const world = {
    base,
    home,
    store,
    edit,
    origin,
    bin,
    git,
    env,
    ag: (args, { cwd = store } = {}) =>
      run(process.execPath, [join(store, "sync/bin/ag.mjs"), ...args], cwd),
    write: (rel, content, root = store) => writeFile(root, rel, content),
    read: (rel, root = store) => readFileSync(join(root, rel), "utf8"),
    exists: (rel, root = store) => existsSync(join(root, rel)),
    commitAll: (root, message) => {
      git(root, "add", "-A");
      git(root, "commit", "-q", "-m", message);
    },
    originHas: (branch, path) =>
      run("git", ["--git-dir", origin, "cat-file", "-e", `${branch}:${path}`], base).status === 0,
    originHasBranch: (branch) =>
      run("git", ["--git-dir", origin, "rev-parse", "--verify", "-q", `refs/heads/${branch}`], base)
        .status === 0,
    linkTarget: (path) => {
      const full = join(home, path);
      return lstatSync(full).isSymbolicLink() ? resolve(readlinkSync(full)) : null;
    },
    stub: (name, source) => writeStub(bin, name, source),
    record: (name) => writeStub(bin, name, recorder(name)),
    calls: (name) => {
      const file = join(bin, `${name}.calls`);
      return existsSync(file)
        ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
        : [];
    },
    // A second bare repository, for a store's own origin or another clone's remote.
    bareRepo: (name) => {
      const path = join(base, `${name}.git`);
      git(base, "init", "-q", "--bare", "-b", "main", path);
      return path;
    },
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
  return world;
}

export function createSetupSkill(world, profile) {
  world.write(`profiles/${profile}/artifacts/skills-profile-me/setup-${profile}/SKILL.md`, "setup\n");
  world.commitAll(world.store, `Add setup-${profile}`);
}

// The default profile with a setup skill, one rule, and two local files.
export function createDefault(world) {
  ok(world.ag(["new", "default"]));
  world.write("profiles/default/profile.yaml", "parent: main\nlocal-files: [.env, .env.outputs]\n");
  world.write("profiles/default/artifacts/skills-profile-me/setup-default/SKILL.md", "setup\n");
  world.write("profiles/default/artifacts/rules-profile-me/default-rule.mdc", "default rule\n");
  world.commitAll(world.store, "Add default content");
  ok(world.ag(["push"]));
  ok(world.ag(["sync"]));
  world.write("profiles/default/.env", "HOME_PATH=/home/test\n");
  world.write("profiles/default/.env.outputs", "fallback=~/.scratch\n");
}
