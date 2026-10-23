#!/usr/bin/env node

// Runs ag, then codex-parity-sync.mjs after an ag command that syncs. To opt in on one machine, link this file
// as `ag` in a folder that comes before the real ag on PATH. Stopgap until sync parity (kkacprzykdev/.agents#2).

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function runScript(script, scriptArgs) {
  const result = spawnSync(process.execPath, [join(__dirname, script), ...scriptArgs], { stdio: "inherit" });
  return result.status ?? 1;
}

const status = runScript("ag.mjs", args);
const syncs = ["sync", "update", "use", "new"].includes(args[0]) || (args[0] === "skills" && args[1] === "add");
if (status !== 0 || !syncs || args.includes("--dry-run")) {
  process.exit(status);
}
process.exit(runScript("codex-parity-sync.mjs", []));
