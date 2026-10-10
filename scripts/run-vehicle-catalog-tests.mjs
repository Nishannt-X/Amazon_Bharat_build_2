/**
 * Runnable invocation for src/lib/vehicle-catalog.test.ts (no installs).
 *
 * Same pattern as scripts/run-place-search-tests.mjs: the repo convention
 * is extensionless imports, which the Node resolver cannot run directly
 * even with type-stripping — so this copies the catalog + test to a temp
 * dir, rewrites the relative import to ./vehicle-catalog.ts, inlines the
 * vehicles.json name catalog (plain JSON imports need import attributes
 * under Node ESM), and runs the Node built-in test runner
 * (`node:test`, no dependencies). It also copies the quarantined
 * research candidates file alongside so tests can assert the quarantine
 * holds (46 candidates, none wired into the verified lookup).
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
const rowsSource = readFileSync(
  join(root, "src", "lib", "verified-spec-rows.ts"),
  "utf8",
);
const namesJson = readFileSync(
  join(root, "src", "data", "vehicles.json"),
  "utf8",
);
// Validate the JSON before inlining so a malformed catalog fails loudly.
JSON.parse(namesJson);
const inlined = catalogSource
  .replace(
    'import vehicleNames from "../data/vehicles.json";',
    `const vehicleNames = ${namesJson};`,
  )
  .replaceAll(
    'from "./verified-spec-rows"',
    'from "./verified-spec-rows.ts"',
  );
if (inlined === catalogSource) {
  console.error("vehicle-catalog.ts data import not found; aborting.");
  process.exit(1);
}
// The catalog imports "./verified-spec-rows" (repo extensionless
// convention): copy the rows file alongside and point at the .ts file.
const inlinedRows = rowsSource.replaceAll(
  'from "./vehicle-catalog"',
  'from "./vehicle-catalog.ts"',
);
writeFileSync(join(dir, "vehicle-catalog.ts"), inlined);
writeFileSync(join(dir, "verified-spec-rows.ts"), inlinedRows);
// Quarantined research candidates: import-free, copied verbatim so tests
// can assert the quarantine (count, shape) without wiring candidates
// into the verified lookup.
const candidatesSource = readFileSync(
  join(root, "src", "lib", "unverified-spec-candidates.ts"),
  "utf8",
);
writeFileSync(join(dir, "unverified-spec-candidates.ts"), candidatesSource);

const testSource = readFileSync(
  join(root, "src", "lib", "vehicle-catalog.test.ts"),
  "utf8",
).replaceAll("./vehicle-catalog", "./vehicle-catalog.ts")
  .replaceAll(
    "./unverified-spec-candidates",
    "./unverified-spec-candidates.ts",
  );
writeFileSync(join(dir, "vehicle-catalog.test.ts"), testSource);

const result = spawnSync(
  process.execPath,
  ["--test", join(dir, "vehicle-catalog.test.ts")],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
