import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "artifacts");
// Importing ag.mjs runs ag, so the kinds are listed here. instructions has no Store artifacts.
const KINDS = ["skills", "commands", "rules", "subagents"];
const FOLDERS = KINDS.flatMap((kind) => [`${kind}-store-me`, `${kind}-core-me`]);

// The same entries ag sync skips.
function visibleEntries(dir) {
  return existsSync(dir)
    ? readdirSync(dir).filter((name) => !name.startsWith(".") && !["desktop.ini", "thumbs.db"].includes(name.toLowerCase()))
    : [];
}

test("artifacts/ holds only a -store-me and a -core-me folder for each artifact kind", () => {
  for (const name of visibleEntries(ARTIFACTS)) {
    assert.ok(
      FOLDERS.includes(name) && statSync(join(ARTIFACTS, name)).isDirectory(),
      `artifacts/${name} is not one of: ${FOLDERS.join(", ")}`,
    );
  }
});

// Links ignore letter case, and Claude links a rule with a .md extension, so x.mdc and X.md collide.
test("no Store artifact shares its name with a Core-owner artifact of the same kind", () => {
  for (const kind of KINDS) {
    const key = (name) => (kind === "rules" ? name.replace(/\.[^.]+$/, "") : name).toLowerCase();
    const storeNames = new Set(visibleEntries(join(ARTIFACTS, `${kind}-store-me`)).map(key));
    const shared = visibleEntries(join(ARTIFACTS, `${kind}-core-me`)).filter((name) => storeNames.has(key(name)));
    assert.deepEqual(shared, [], `artifacts/${kind}-store-me and artifacts/${kind}-core-me share these names`);
  }
});
