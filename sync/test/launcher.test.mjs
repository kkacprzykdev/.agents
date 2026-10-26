import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";
import { createDefault, createWorld, ok } from "./world.mjs";

const WINDOWS = process.platform === "win32";

let world;
beforeEach(() => {
  world = createWorld();
});
afterEach(() => world.cleanup());

const launcherDir = () => join(world.home, ".local", "bin");
const launcherFile = (name = "ag") => readFileSync(join(launcherDir(), name), "utf8");
const storeAg = (script = "ag.mjs") => join(world.store, "sync", "bin", script);
const putLauncherFile = (name, text) => writeFileSync(join(launcherDir(), name), text);
// Git Bash reads a Windows path with forward slashes.
const forShell = (path) => path.split("\\").join("/");

// Runs the Launcher with only its own folder and node's folder on PATH.
function runLauncher(args, { gitBash = false } = {}) {
  const env = { ...world.env, PATH: [launcherDir(), dirname(process.execPath)].join(delimiter) };
  if (gitBash) {
    const gitExec = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
    const sh = join(gitExec, "..", "..", "..", "usr", "bin", "sh.exe");
    return spawnSync(sh, ["-c", `ag ${args.join(" ")}`], { env, encoding: "utf8" });
  }
  return spawnSync("ag", args, { env, encoding: "utf8", shell: WINDOWS });
}

test("ag sync writes the Launcher, which runs ag with only its own folder and node's on PATH", () => {
  createDefault(world);

  const script = launcherFile("ag");
  assert.match(script, /^# ag launcher$/m);
  assert.ok(script.includes(`exec node "${forShell(storeAg())}" "$@"`), script);
  assert.match(ok(runLauncher(["help"], { gitBash: WINDOWS })), /ag — manage the ~\/\.agents store/);
  if (WINDOWS) {
    const cmd = launcherFile("ag.cmd");
    assert.match(cmd, /^@rem ag launcher\r$/m);
    assert.ok(cmd.includes(`"${storeAg()}" %*`), cmd);
    assert.match(ok(runLauncher(["help"])), /ag — manage the ~\/\.agents store/);
  }
});

test("ag sync rewrites a Launcher an older ag wrote, and keeps its Codex parity wrapper target", () => {
  createDefault(world);
  putLauncherFile("ag", '#!/bin/sh\n# ag launcher\nnode "/old/store/sync/bin/ag-codex-parity.mjs" "$@"\n');

  const output = ok(world.ag(["sync"]));

  assert.ok(launcherFile("ag").includes(`exec node "${forShell(storeAg("ag-codex-parity.mjs"))}" "$@"`), launcherFile("ag"));
  assert.match(output, /updated: Launcher ~\/\.local\/bin\/ag, which runs sync\/bin\/ag-codex-parity\.mjs/);
});

test("ag sync keeps a file at the Launcher's path that is not a Launcher, and names it", () => {
  createDefault(world);
  putLauncherFile("ag", "#!/bin/sh\necho mine\n");

  const output = ok(world.ag(["sync"]));

  assert.equal(launcherFile("ag"), "#!/bin/sh\necho mine\n");
  assert.match(output, /warning: ~\/\.local\/bin\/ag is not an ag Launcher, so ag left it\./);
});

test("ag sync replaces an old link into the store's sync/bin/ with a Launcher that keeps its target", () => {
  createDefault(world);
  const wrapper = world.read("sync/bin/ag-codex-parity.mjs");
  rmSync(join(launcherDir(), "ag"));
  symlinkSync(storeAg("ag-codex-parity.mjs"), join(launcherDir(), "ag"), "file");

  const output = ok(world.ag(["sync"]));

  assert.equal(lstatSync(join(launcherDir(), "ag")).isSymbolicLink(), false);
  assert.ok(launcherFile("ag").includes(`exec node "${forShell(storeAg("ag-codex-parity.mjs"))}" "$@"`), launcherFile("ag"));
  assert.equal(world.read("sync/bin/ag-codex-parity.mjs"), wrapper);
  assert.match(output, /replaced: the link ~\/\.local\/bin\/ag with a Launcher, which runs sync\/bin\/ag-codex-parity\.mjs/);
});

test("ag sync --dry-run reports the Launcher it would write and writes nothing", () => {
  createDefault(world);
  rmSync(launcherDir(), { recursive: true });

  const output = ok(world.ag(["sync", "--dry-run"]));

  assert.equal(existsSync(launcherDir()), false);
  assert.match(output, /would create: Launcher ~\/\.local\/bin\/ag, which runs sync\/bin\/ag\.mjs/);
});

test("a Launcher that cannot be written gets a warning with the node command, and Sync still links", () => {
  createDefault(world);
  rmSync(launcherDir(), { recursive: true });
  writeFileSync(launcherDir(), "a file where the folder should be\n");
  rmSync(join(world.home, ".cursor/rules"), { recursive: true });

  const output = ok(world.ag(["sync"]));

  assert.match(output, /warning: ag could not write the Launcher ~\/\.local\/bin\/ag \(\w+\)\. Run ag as: node .+ag\.mjs <command>/);
  assert.equal(world.linkTarget(".cursor/rules/default-rule.mdc"), join(world.store, "profiles/default/artifacts/rules-profile-me/default-rule.mdc"));
});

const PATH_HINTS = [
  ["/bin/zsh", 'Add this line to ~/.zshrc, then open a new terminal:\n  export PATH="$HOME/.local/bin:$PATH"'],
  ["/bin/bash", 'Add this line to ~/.bash_profile, then open a new terminal:\n  export PATH="$HOME/.local/bin:$PATH"'],
  ["/opt/homebrew/bin/fish", "Run this once in fish, then open a new terminal:\n  fish_add_path ~/.local/bin"],
];
for (const [shell, hint] of PATH_HINTS) {
  test(`ag sync prints the PATH line for ${basename(shell)} while the Launcher's folder is not on PATH`, { skip: WINDOWS }, () => {
    createDefault(world);

    const output = ok(world.ag(["sync"], { env: { SHELL: shell } }));

    assert.ok(output.includes(`warning: ~/.local/bin is not on PATH, so the ag command is not found. ${hint}\n`), output);
  });
}

test("ag sync prints no PATH line when the Launcher's folder is on PATH", { skip: WINDOWS }, () => {
  createDefault(world);

  const output = ok(world.ag(["sync"], { env: { SHELL: "/bin/zsh", PATH: `${launcherDir()}${delimiter}${world.env.PATH}` } }));

  assert.doesNotMatch(output, /not on PATH/);
});

test("on Windows, ag sync adds the Launcher's folder to the user PATH through PowerShell, and never with setx", { skip: !WINDOWS }, () => {
  world.stub(
    "powershell",
    `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
const call = { script, dir: process.env.AG_LAUNCHER_DIR, reportOnly: process.env.AG_REPORT_ONLY };
appendFileSync(new URL("./powershell.calls", import.meta.url), JSON.stringify(call) + "\\n");
console.log("added");
`,
  );

  const output = ok(world.ag(["new", "default"]));

  const call = world.calls("powershell").at(-1);
  assert.equal(call.dir, launcherDir());
  assert.equal(call.reportOnly, "");
  assert.match(call.script, /\[Environment\]::GetEnvironmentVariable\('Path', 'User'\)/);
  assert.match(call.script, /\[Environment\]::SetEnvironmentVariable\('Path', .+, 'User'\)/);
  assert.doesNotMatch(call.script, /setx/i);
  assert.match(output, /added: ~\/\.local\/bin to your user PATH\. Open a new terminal, so it finds the ag command\./);
});

// A PATH with the given folders first, then what ag itself needs: the stubs, node, and git.
function pathWith(...dirs) {
  const gitCore = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
  return [...dirs, world.bin, dirname(process.execPath), gitCore].join(delimiter);
}

// A folder under the test base, holding one ag command that is not the Launcher.
function otherAg(folder, { linkTo } = {}) {
  const dir = join(world.base, folder);
  mkdirSync(dir, { recursive: true });
  if (linkTo) {
    symlinkSync(linkTo, join(dir, "ag"), "file");
  } else {
    const name = WINDOWS ? "ag.cmd" : "ag";
    writeFileSync(join(dir, name), WINDOWS ? "@echo silver searcher\r\n" : "#!/bin/sh\necho silver searcher\n");
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

test("ag sync warns about an ag that runs this store's ag outside the Launcher, wherever it is on PATH", () => {
  createDefault(world);
  const npmBin = otherAg("npm-bin", { linkTo: storeAg() });

  const output = ok(world.ag(["sync"], { env: { PATH: pathWith(launcherDir(), npmBin) } }));

  assert.ok(
    output.includes(`warning: ${join(npmBin, "ag")} also runs this store's ag, beside the Launcher. It may be an old npm link. Remove it with npm rm -g ag, run with the Node version of ${npmBin}.`),
    output,
  );
});

test("ag sync warns about a foreign ag before the Launcher on PATH, and not about one after it", () => {
  createDefault(world);
  const before = otherAg("before");
  const after = otherAg("after");

  const output = ok(world.ag(["sync"], { env: { PATH: pathWith(before, launcherDir(), after) } }));

  const name = WINDOWS ? "ag.cmd" : "ag";
  assert.ok(
    output.includes(`warning: ${join(before, name)} is another ag command, and it comes before the Launcher on PATH, so it runs in place of ag. Check with whence -p ag in zsh or type -a ag in bash, and put ~/.local/bin before ${before} on PATH.`),
    output,
  );
  assert.ok(!output.includes(after), output);
});

test("ag status shows the Launcher, its target, whether its folder is on PATH, and the other ag commands", () => {
  createDefault(world);
  const npmBin = otherAg("npm-bin", { linkTo: storeAg() });

  const output = ok(world.ag(["status"], { env: { PATH: pathWith(launcherDir(), npmBin) } }));

  assert.match(output, /^Launcher: +~\/\.local\/bin\/ag runs sync\/bin\/ag\.mjs$/m);
  if (WINDOWS) {
    assert.match(output, /^ +~\/\.local\/bin\/ag\.cmd runs sync\/bin\/ag\.mjs$/m);
  }
  assert.match(output, /^ +~\/\.local\/bin is on PATH$/m);
  assert.match(output, /^ +warning: .+ also runs this store's ag, beside the Launcher\./m);
});

test("ag status reports a missing Launcher and writes nothing", () => {
  createDefault(world);
  rmSync(launcherDir(), { recursive: true });

  const output = ok(world.ag(["status"]));

  assert.match(output, /^Launcher: +~\/\.local\/bin\/ag is missing \(run ag sync\)$/m);
  assert.equal(existsSync(launcherDir()), false);
});
