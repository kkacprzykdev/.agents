import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
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
const CORE_FILES = [
  "sync/bin/ag.mjs",
  "sync/migrations",
  "sync/bin/codex-parity-sync.mjs",
  "sync/bin/ag-codex-parity.mjs",
  "sync/runtimes.yaml",
  ".githooks/pre-push",
  ".githooks/pre-commit",
  ".gitattributes",
];

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

// The last commit of the source repository before Profile migrations. Its ag knows no migration-level key.
// CI checks out the full history, so git show finds it.
const PINNED_OLD_AG = "120d8aaa7203e62ec53104e226bb3a715fa26568";

export const CURRENT_AG = readFileSync(join(REPO, "sync/bin/ag.mjs"), "utf8");

export function oldAgSource() {
  const result = spawnSync("git", ["-C", REPO, "show", `${PINNED_OLD_AG}:sync/bin/ag.mjs`], {
    env: cleanEnv({}),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `git show of the old ag failed: ${result.stderr}`);
  return result.stdout;
}

// A throwaway world: a bare origin, a store at $HOME/.agents on main, and empty runtime homes.
// world.computer() adds another computer with its own home and a clone of the same origin.
// With agSource, the store's first Core commit holds that ag instead of this repository's.
export function createWorld({ agSource } = {}) {
  // Native, so Windows short names in the temp folder (RUNNER~1) become the long names git reports.
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), "ag-test-")));
  const bin = join(base, "bin");
  const origin = join(base, "origin.git");
  mkdirSync(bin, { recursive: true });

  const envFor = (home) =>
    cleanEnv({
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
  // A real npm could change the machine's global packages, and a real gh could create repositories.
  writeStub(bin, "npm", recorder("npm"));
  writeStub(bin, "gh", "process.exit(1);\n");
  // On Windows, Sync adds the Launcher's folder to the user PATH through PowerShell. A real call would change the runner's.
  writeStub(bin, "powershell", `${recorder("powershell")}console.log("on-path");\n`);

  const baseEnv = envFor(join(base, "home"));
  const run = (command, args, cwd, env = baseEnv) => spawnSync(command, args, { cwd, env, encoding: "utf8" });

  const git = (cwd, ...args) => {
    const result = run("git", args, cwd);
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} in ${cwd}: ${result.stderr}${result.stdout}`);
    }
    return result.stdout.trim();
  };

  const commitAll = (root, message) => {
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", message);
  };

  // One computer: a home with empty agent homes, and the store at $HOME/.agents.
  const computer = (home) => {
    const env = envFor(home);
    const store = join(home, ".agents");
    for (const dir of [join(home, ".cursor"), join(home, ".claude")]) {
      mkdirSync(dir, { recursive: true });
    }
    return {
      home,
      store,
      edit: `${store}-edit`,
      env,
      ag: (args, { cwd = store, env: extra = {} } = {}) =>
        run(process.execPath, [join(store, "sync/bin/ag.mjs"), ...args], cwd, { ...env, ...extra }),
      write: (rel, content, root = store) => writeFile(root, rel, content),
      read: (rel, root = store) => readFileSync(join(root, rel), "utf8"),
      exists: (rel, root = store) => existsSync(join(root, rel)),
      linkTarget: (path) => {
        const full = join(home, path);
        return lstatSync(full).isSymbolicLink() ? resolve(readlinkSync(full)) : null;
      },
    };
  };

  const first = computer(join(base, "home"));
  const { store, edit } = first;
  mkdirSync(store, { recursive: true });

  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(store, "init", "-q", "-b", "main");
  for (const rel of CORE_FILES) {
    mkdirSync(dirname(join(store, rel)), { recursive: true });
    cpSync(join(REPO, rel), join(store, rel), { recursive: true });
  }
  if (agSource) {
    writeFileSync(join(store, "sync/bin/ag.mjs"), agSource);
  }
  chmodSync(join(store, ".githooks/pre-push"), 0o755);
  chmodSync(join(store, ".githooks/pre-commit"), 0o755);
  for (const kind of ["skills", "commands", "rules", "subagents"]) {
    writeFile(store, `artifacts/${kind}-store-me/.gitkeep`, "");
    writeFile(store, `artifacts/${kind}-core-me/.gitkeep`, "");
  }
  writeFile(store, "artifacts/rules-store-me/store-rule.mdc", "store rule\n");
  writeFile(store, ".gitignore", ".DS_Store\n");
  git(store, "add", "-A");
  git(store, "commit", "-q", "-m", "Core");
  git(store, "remote", "add", "origin", origin);
  git(store, "push", "-q", "-u", "origin", "main");

  const world = {
    ...first,
    base,
    origin,
    bin,
    git,
    // Like git, but returns the result instead of throwing, for commands that are expected to fail.
    tryGit: (cwd, ...args) => run("git", args, cwd),
    commitAll,
    originHas: (branch, path) =>
      run("git", ["--git-dir", origin, "cat-file", "-e", `${branch}:${path}`], base).status === 0,
    originHasBranch: (branch) =>
      run("git", ["--git-dir", origin, "rev-parse", "--verify", "-q", `refs/heads/${branch}`], base)
        .status === 0,
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
    // Another computer with its own home, its store cloned from origin, on main.
    computer: (name) => {
      const other = computer(join(base, name));
      git(base, "clone", "-q", origin, other.store);
      return { ...other, git, commitAll };
    },
    // Commits a Profile migration module to main and pushes it, as a Core change would.
    addMigration: (file, source) => {
      const checkout = git(store, "branch", "--show-current") === "main" ? store : edit;
      if (checkout === edit) {
        ok(first.ag(["edit", "main"]));
      }
      writeFile(checkout, `sync/migrations/${file}`, source);
      commitAll(checkout, `Add migration ${file}`);
      git(checkout, "push", "-q", "origin", "main");
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
