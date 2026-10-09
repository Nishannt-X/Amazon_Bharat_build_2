/**
 * Runnable invocation for src/lib/place-search.test.ts (no installs).
 *
 * The repo convention is extensionless imports, which the Node resolver
 * cannot run directly even with type-stripping — so this copies the adapter
 * + test to a temp dir, rewrites the relative import to ./place-search.ts,
 * and runs the Node built-in test runner (`node:test`, no dependencies).
 *
 * Usage: npm run test:search
 */
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "ff-place-search-"));

copyFileSync(
  join(root, "src", "lib", "place-search.ts"),
  join(dir, "place-search.ts"),
);

const testSource = readFileSync(
  join(root, "src", "lib", "place-search.test.ts"),
  "utf8",
).replaceAll("./place-search", "./place-search.ts");
writeFileSync(join(dir, "place-search.test.ts"), testSource);

const result = spawnSync(
  process.execPath,
  ["--test", join(dir, "place-search.test.ts")],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
