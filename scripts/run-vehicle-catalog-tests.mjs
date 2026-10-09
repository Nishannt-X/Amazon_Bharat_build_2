/**
 * Runnable invocation for src/lib/vehicle-catalog.test.ts (no installs).
 *
 * Same pattern as scripts/run-place-search-tests.mjs: the repo convention
 * is extensionless imports, which the Node resolver cannot run directly
 * even with type-stripping — so this copies the catalog + test to a temp
 * dir, rewrites the relative import to ./vehicle-catalog.ts, inlines the
 * vehicles.json name catalog (plain JSON imports need import attributes
 * under Node ESM), and runs the Node built-in test runner
 * (`node:test`, no dependencies).
 *
 * Usage: npm run test:vehicles
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "ff-vehicle-catalog-"));

const catalogSource = readFileSync(
  join(root, "src", "lib", "vehicle-catalog.ts"),
  "utf8",
);
const namesJson = readFileSync(
  join(root, "src", "data", "vehicles.json"),
  "utf8",
);
// Validate the JSON before inlining so a malformed catalog fails loudly.
JSON.parse(namesJson);
const inlined = catalogSource.replace(
  'import vehicleNames from "../data/vehicles.json";',
  `const vehicleNames = ${namesJson};`,
);
if (inlined === catalogSource) {
  console.error("vehicle-catalog.ts data import not found; aborting.");
  process.exit(1);
}
writeFileSync(join(dir, "vehicle-catalog.ts"), inlined);

const testSource = readFileSync(
  join(root, "src", "lib", "vehicle-catalog.test.ts"),
  "utf8",
).replaceAll("./vehicle-catalog", "./vehicle-catalog.ts");
writeFileSync(join(dir, "vehicle-catalog.test.ts"), testSource);

const result = spawnSync(
  process.execPath,
  ["--test", join(dir, "vehicle-catalog.test.ts")],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
