// Profile migration modules for the tests to commit into the throwaway store's Core.

// A migration that writes one file into the profile folder. Writing the same content again changes nothing.
export function writes(rel, content) {
  return `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function migrate(profileDir) {
  const path = join(profileDir, ${JSON.stringify(rel)});
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, ${JSON.stringify(content)});
  return { status: "done" };
}
`;
}

// A migration that records the path it was loaded from, to show which checkout's Core ran it.
export function writesOwnPath(rel) {
  return `import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function migrate(profileDir) {
  writeFileSync(join(profileDir, ${JSON.stringify(rel)}), fileURLToPath(import.meta.url));
  return { status: "done" };
}
`;
}
